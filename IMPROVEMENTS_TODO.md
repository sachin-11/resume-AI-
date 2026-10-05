# Improvements TODO — Module Wise

> Full-codebase audit se nikle findings (interview core, recruiter/auth/billing, aur Python `agent-service` — teeno modules cover kiye). Har item ke saath file:line, problem, aur **kyu matter karta hai**. Implement karte waqt checkbox tick karo.
>
> Severity: 🔴 High (security/data/compliance risk ya core-product breaking) · 🟡 Medium · 🟢 Low

---

## 0. Sabse pehle ye 5 (impact vs effort — quick wins + critical)

- [x] 🔴 Public interview routes mein invite-token verification add karo (§2)
- [ ] 🔴 `user/delete` ko try/catch + Stripe cleanup do (§9)
- [ ] 🔴 Login pe rate limiting wire karo — `RATE_LIMITS.login` already defined hai, bas kahin use nahi ho raha (§7)
- [x] 🟡 Apna `AiUsageLog` DB-write fire-and-forget banao, aur Langfuse ko actually await karo (§1)
- [ ] 🔴 `agent-service` mein `llm.invoke()` → `llm.ainvoke()` switch karo (§10) — bada refactor but concurrency ka root cause

---

## 1. AI Cost Tracking (jo hum abhi bana chuke — apne hi kaam ka fix)

- [x] 🟡 **`lib/groq.ts` — `logAiUsage`'s DB write hot path mein hai.** `await db.aiUsageLog.create(...)` AI response return karne se pehle chalta hai — har hint/question-gen/feedback call ek extra DB round-trip wait karta hai.
  **Fix**: DB write ko fire-and-forget (`void ... .catch(...)`) banao, jaise webhooks/emails already handle hote hain codebase mein. *(Done in `c5be422` — verified in current `lib/groq.ts`.)*
- [x] 🔴 **`lib/langfuse.ts` vs `lib/groq.ts:70` — flush contradiction.** `logGeneration` khud comment karta hai "awaits flush so serverless doesn't freeze mid-upload," lekin caller (`groq.ts`) usse `void` (fire-and-forget) call karta hai — apna hi design intent violate ho raha hai. Traces silently drop ho sakte hain Vercel/Amplify pe.
  **Fix**: Decide karo — ya to `await logGeneration(...)` karo (thoda latency add hoga), ya comment/design hata do aur explicitly fire-and-forget accept karo. *(Done in `c5be422` — `groq.ts` now `await`s `logGeneration`.)*
- [x] 🟡 **`lib/interview-answer-analysis.ts` + `lib/interview-adaptive-checkpoint.ts` — untagged `callGroq()` calls.** Confidence-analysis, follow-up, aur adaptive-checkpoint calls (har answer pe fire hote hain) `AiCallContext` nahi bhejte — per-interview cost tracking inhe count nahi karta, actual spend undercount hota hai.
  **Fix**: In teeno jagah `callGroq(..., undefined, { userId, sessionId, feature: "..." })` add karo. *(Done — `analyzeAnswerAndMaybeFollowup` now takes `{ userId, sessionId }` and tags `confidence-analysis`/`adaptive-followup`; `runAdaptiveCheckpoint` tags `adaptive-checkpoint`; both API routes pass context through.)*

---

## 2. Public/Candidate Interview Routes — 🔴 sabse critical security gap

- [x] 🔴 **`app/api/interview/public/[sessionId]/route.ts`** (GET) — zero auth, koi bhi sessionId se poora transcript (saare Q&A) padh sakta hai. *(Already fixed — `verifyInviteToken` gate confirmed in place.)*
- [x] 🔴 **`public/answer`, `public/tab-switch`, `public/photo`, `public/audio`, `public/complete`** — sab `sessionId` pe hi mutate karte hain, `token` optional/decorative hai. Attacker doosre candidate ke answers inject kar sakta hai, fake proctoring violations bhar sakta hai, ya session forcibly complete/abandon kar sakta hai.
  **Fix**: har route mein pehle `db.candidateInvite.findFirst({ where: { token, sessionId } })` verify karo before koi bhi read/write — jaisa authenticated `interview/answer/route.ts` `userId` ke saath already karta hai. *(Already fixed — all five routes verified to call `verifyInviteToken` before any read/write.)*
- [x] 🟢 `campaigns/[id]/invites`, `import`, `retake`, `team` — temp password `Math.random().toString(36)` se generate hota hai (non-CSPRNG). `crypto.randomBytes` pe switch karo. *(Done — added `lib/temp-password.ts` (`generateTempPassword()`, `crypto.randomBytes(9)` base64url) and swapped all 4 call sites.)*

---

## 3. Mock Interview Engine (live interview UX/reliability)

- [x] 🔴 **Sequential AI calls per answer** (`lib/interview-answer-analysis.ts` + `lib/interview-adaptive-checkpoint.ts`, called from `interview/answer/route.ts`) — 2-3 sequential `callGroq()` calls, har ek 90s tak block ho sakta hai (Groq→OpenAI→Groq fallback chain). Live timed interview mein candidate ka submit click minutes tak hang ho sakta hai. *(Done — both `interview/answer/route.ts` and `public/answer/route.ts` now run the confidence/follow-up chain concurrently with `runAdaptiveCheckpoint` via `Promise.all`, instead of sequentially after it.)*
- [x] 🔴 **`components/interview/candidate-session.tsx`** — answer/complete fetch calls try/catch ke bina hain. Ek network blip pe `submitting`/`finishing` state permanently `true` reh jaata hai, Send button/mic hamesha ke liye disabled. *(Done — `doSubmit`'s answer fetch and `handleFinish`'s complete fetch are now wrapped in try/catch/finally so `submitting`/`finishing` always resets.)*
- [x] 🔴 **`app/api/interview/complete/route.ts`** — `sessionId` missing hone pe guard nahi hai. Prisma `undefined` filter key drop karta hai, so ek malformed request se **user ke saare sessions** "completed" mark ho sakte hain. *(Done — explicit `sessionId` presence/type guard added before the `updateMany`.)*
- [x] 🟡 **Free-tier limit race condition** (`interview/create/route.ts`) — `interviewsThisMonth` sirf end mein increment hota hai. Double-click/retry se user apni monthly cap se zyada interviews bana sakta hai. *(Done — added `reserveInterviewSlot`/`releaseInterviewSlot` in `lib/stripe.ts`, using a `FOR UPDATE`-locked transaction to atomically check-and-increment upfront; released back on any downstream failure.)*
- [x] 🟢 `interview/create/route.ts` — har question ke liye alag `$executeRaw` loop mein (batch nahi hai) — question count badhne pe latency badhti hai. *(Done — collapsed into a single batched `UPDATE ... FROM (VALUES ...)` statement via `Prisma.join`/`Prisma.sql`.)*

---

## 4. Feedback & Scoring

- [x] 🟡 **AI fail/malformed JSON → `MOCK_FEEDBACK` silently save hota hai** (`feedback/generate/route.ts`, `public/complete/route.ts`). Canned demo scores recruiter ko email jaate hain, webhook fire hota hai — kahin flag nahi hota ki ye fake data hai.
  **Fix**: fallback use hone pe report/webhook mein `isFallback: true` jaisa flag add karo. *(Done — added `FeedbackReport.isFallback` (migration `20260922104523_add_feedback_is_fallback`), set via `feedback === MOCK_FEEDBACK` reference check in both routes. Threaded through `WebhookPayload`, recruiter/candidate emails (with a visible warning note when true), and surfaced on the feedback report page, campaigns list, and compare page as "⚠️ Score unavailable".)*
- [x] 🟡 **Candidate PII Langfuse ko verbatim jaata hai** (`lib/langfuse.ts` ← `groq.ts`) — resume text + full interview transcript, no redaction/consent gate. *(User chose "strip content, keep metadata" over redaction/consent-gate. `logGeneration` now sends `[redacted — N chars]` placeholders instead of raw input/output; full content stays first-party in `AiUsageLog` only. Applied the same fix to the Python mirror, `agent-service/agents/shared/observability.py`'s `trace_guardrail`, which had the same verbatim-content issue.)*
- [x] 🟢 AI-returned scores DB mein bina validation ke save hote hain — NaN/undefined persist ho sakta hai `feedback/generate/route.ts` mein. *(Done — added exported `clampScore()` in `lib/utils.ts`, applied to all 4 score fields in both `feedback/generate/route.ts` and `public/complete/route.ts` before they reach the DB/emails/webhooks.)*

---

## 5. Proctoring — sabse chaunkane wala finding

- [x] 🔴 **Face/gaze detection almost sab browsers pe silently no-op hai** (`hooks/use-proctoring.ts`) — `window.FaceDetector` desktop Chrome/Firefox/Safari/Edge mein kabhi shipped nahi hua. "multiple_faces"/"no_face" checks 99% candidates ke liye kabhi chalte nahi, UI phir bhi "clean" flag dikhata hai — false assurance. *(Fixed the honesty gap, not the detection itself — user chose "surface honestly" over building real ML-based detection. Added `InterviewSession.faceDetectionActive`, set from client via `faceDetectionSupported`, sent with complete/abandon. Recruiter campaigns list + compare page now show "👁️ No face check" when it never ran, instead of implying a clean flag means it was verified.)*
- [x] 🟡 **Tab-switch double-counted** (`candidate-session.tsx`) — `blur` + `visibilitychange` dono ek real switch pe fire hote hain, honest candidates 2x speed se "suspicious" flag ki taraf badhte hain. *(Done — merged into one `recordTabSwitch` gated by a 500ms debounce shared between both listeners.)*
- [x] 🟡 Camera poori tarah candidate-optional hai — server-side koi enforcement nahi ki camera on tha. *(User chose "track & report only" over hard-blocking. Added `InterviewSession.cameraEverEnabled`, set from client, sent with complete/abandon. Recruiter campaigns list + compare page now show "📷 No camera" when it was never enabled.)*
- [x] 🟢 Noise-detection ka alag `getUserMedia` call silently fail ho sakta hai (empty catch) — koi signal nahi milta ki disabled ho gaya. *(Done — hook now exposes `noiseDetectionActive` and `console.warn`s on failure instead of a bare empty catch.)*

---

## 6. Resume Intelligence / RAG

- [x] 🟡 **Embedding-space mismatch** (`lib/rag.ts`) — index-time pseudo-embedding + query-time real-embedding (ya vice versa) se similarity scores meaningless ho jaate hain, RAG silently empty context return karta hai, koi error nahi. *(Done — `getEmbedding` now throws on an OpenAI failure instead of silently falling back to `pseudoEmbed` mid-stream; every vector is tagged with `embeddingProvider` metadata at index time, and retrieval filters on the current provider so it never compares across incompatible spaces.)*
- [x] 🟡 **`resume/improve/route.ts`** — hardcoded fallback secret (`"dev-secret-change-in-production"`), sirf `AGENT_SERVICE_URL` check hota hai `AGENT_SECRET` nahi. *(Done — removed the shared hardcoded default on both sides (`agent-service/main.py` now fails closed, fixed the same pattern in 7 more Next.js routes that had it copy-pasted: `agents/route.ts`, `agents/screen-candidate`, `agents/daily-ops`, `agents/market-intelligence`, `agents/panel-interview`, `agents/learning-path`, `auto-apply/fetch-jobs`, `job-match-agent`); `resume/improve` + `job-match-agent` now also 503 with a clear message if `AGENT_SECRET` is unset instead of silently proceeding.)*
- [x] 🟢 `resume/upload/route.ts` — `autoMatchAgainstAllJDs` sequential loop, ek JD fail ho to baaki sab silently skip. *(Done — batched (5 concurrent) with per-JD try/catch, so one failing JD no longer aborts the rest; logs how many actually matched.)*
- [x] 🟢 `resume/bulk-upload/route.ts` — koi rate limit nahi (single upload mein hai), 50 files tak sequential processing. *(Done — added `RATE_LIMITS.bulkResumeUpload` (3/hour), and batched file processing 5-at-a-time instead of one-at-a-time.)*

---

## 7. Recruiter / Job Agent / Auto-Apply

- [ ] 🔴 **`job-agent/scrape-jd/route.ts` — SSRF risk.** User-supplied URL Playwright se seedha navigate hota hai, private-IP/cloud-metadata-IP (169.254.169.254) allowlist nahi hai. Koi bhi logged-in user (candidate role bhi) internal-network fetch करवा sakta hai.
- [ ] 🟡 Same route pe rate limit nahi — full Chromium + Groq call per request, cost/DoS vector.
- [ ] 🟡 **`auto-apply/fetch-jobs/route.ts`** — hardcoded fallback `AGENT_SECRET` (same pattern jaise agent-service mein).
- [ ] 🟡 **`team/route.ts`** — existing user ko invite karne pe unka global `role` silently overwrite ho jaata hai, bina notify kiye.

---

## 8. Auth & Security

- [ ] 🔴 **`RATE_LIMITS.login` define hai but kahin use nahi hota** — NextAuth credentials login pe zero rate limiting, unlimited password-guessing possible.
- [ ] 🟡 OTP send route — per-phone limit hai but per-IP nahi, SMS cost-abuse vector.
- [ ] 🟡 Rate limiter in-process `Map` hai — horizontally-scaled/serverless deployment mein har limit effectively `configured × instance-count` ban jaata hai.
- [ ] 🟢 `PasswordResetToken`/`CandidateInvite` tokens `cuid()` se bante hain (non-CSPRNG) — `crypto.randomBytes` better hota bearer-secret ke liye.

---

## 9. Billing (Stripe) & GDPR

- [ ] 🟡 **Stripe webhook — no ordering/idempotency handling.** Delayed retry ya out-of-order event se cancelled user ka access silently re-activate ho sakta hai (revenue leak).
- [ ] 🟢 `invoice.payment_failed` sirf console.warn karta hai — koi downgrade/dunning action nahi.
- [ ] 🔴 **`user/delete/route.ts` try/catch ke bina hai.** Organization-owner user delete karega to FK-constraint pe crash (Prisma P2003) hoga, account kabhi delete nahi hoga — GDPR erasure silently fail.
- [ ] 🟡 Delete route Stripe subscription cancel nahi karta — user "delete" ho jaaye but billing continue ho sakti hai.
- [ ] 🟢 `AiUsageLog.userId` FK relation ke bina hai — user delete pe rows orphan reh jaate hain.

---

## 10. Python `agent-service` — structural concurrency issue

- [ ] 🔴 **28 mein se 0 LLM calls `ainvoke()` use karte hain** (sab `invoke()`). LangGraph async-variant na hone pe node ko **event loop pe hi synchronously** chalata hai — jab ek LLM call chal raha ho, poora FastAPI process (saare concurrent candidates ke requests) block ho jaata hai.
  **Fix**: `llm.invoke(...)` → `await llm.ainvoke(...)` sab 28 jagah (ya kam se kam sabse hot paths — interview_evaluator, orchestrator).
- [ ] 🔴 **`main.py` — hardcoded default `AGENT_SECRET`** (`"dev-secret-change-in-production"`). Env var missing ho to sab endpoints (LLM $, GitHub PAT, Pinecone) publicly-known secret se accessible.
- [ ] 🔴 **`interview_evaluator/nodes.py` — contradiction penalty double-applied.** LLM ko prompt mein bola jaata hai penalty already factor karo, phir code mechanically wahi penalty phir subtract karta hai (4 contradictions = 40-point penalty jab intent 20 tha).
- [ ] 🟡 **`interview_evaluator/nodes.py:44`** — `int(result.get("score", 50))` crash karta hai agar LLM `"score": null` return kare (default sirf key-absent pe apply hota hai).
- [ ] 🔴 **11 mein se 11 endpoints** (orchestrator/scheduler/faq samet) try/except ke bina — sirf `/improve-resume` protected hai. Koi bhi node exception → raw unhandled 500.
- [ ] 🟡 **MCP subprocess leak** (`candidate_screening`, `auto_apply`, `scheduler` nodes) — `call_tool()` throw kare to `close()` kabhi nahi chalta, GitHub/Brave/Calendar subprocess leak ho jaata hai. try/finally use karo.
- [ ] 🟡 **`requirements.txt` pins badly drifted** vs actually-installed versions (e.g. langgraph 0.2.28 pinned vs 0.3.34 installed) — fresh install/CI mein breaking changes ka risk.
- [ ] 🟡 **`learning_path/graph.py`** — `hours_per_week=0` pe `ZeroDivisionError`, koi request validation nahi.
- [ ] 🟢 **`interview_panel/graph.py`** — consensus sirf 3 scores read karta hai, baaki fields (system_design/culture_fit/role_fit) discard hote hain; docstring "simultaneous" bolta hai but execution sequential hai (comment mein already noted).
- [ ] 🟢 **`faq/store.py`** — embedding fallback silent hai (bare `except: pass`), aur Pinecone sync calls `async def` ke andar bina `asyncio.to_thread` ke — same event-loop-blocking class as above.
- [ ] 🟢 **`job_match/state.py`** — `logs: list` mein reducer (`Annotated[List[str], operator.add]`) missing hai jo baaki sab agents mein hai — response mein sirf last node ka log line dikhta hai, poora trail lost.
- [ ] 🟢 `auto_apply/nodes.py` — untrusted Brave Search text seedha LLM prompt mein jaata hai, `jobUrl` validation nahi.
- [ ] 🟢 `candidate_screening/nodes.py` — GitHub username URL mein unescaped (`urllib.parse.quote` missing).

---

*Generated from a 3-agent parallel audit, 19 Sep 2026. Har item verify karke tick karo — kuch (jaise Stripe idempotency) design decision bhi ho sakte hain, blindly sab fix mat karo.*
