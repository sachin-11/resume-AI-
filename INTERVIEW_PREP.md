# Interview Prep — AI Resume Coach (pura project, simple bhasha mein)

> Ye file interview ki taiyari ke liye hai: project kaise samjhana hai, kaunse numbers bolne hain,
> aur interviewer ke **counter questions** ke imaandaar jawab.
> Saath mein padho: `PROJECT_GUIDE.md` (features + concepts) aur `EVALS_GUIDE.md` (testing ki detail).

**Sabse zaroori niyam:** sirf wahi bolo jo sach hai aur jo tum samjha sakte ho. Har number neeche diya hai — usse bada mat karna.

---

## 1. 30-second pitch

> "I built **AI Resume Coach**, an AI hiring platform. Candidates get resume analysis and AI mock interviews; recruiters get bulk AI interviews, AI screening and a **Recruitment Copilot** that runs multi-step work from chat — *'screen this candidate and if she's shortlisted, book an interview'* — with a human approval before anything that affects a person.
> It's a Next.js app plus a separate Python **LangGraph** agent service. The part I'm proudest of is the production side: every agent runs under budgets and timeouts, has a kill switch, and is gated by real-LLM evals in CI — including prompt-injection and fairness tests. Most recently I added a coding-assessment agent that runs candidates' code in an **AWS Bedrock AgentCore** sandbox instead of an LLM guessing whether it's correct."

**Hindi mein yaad rakhne ke liye:** hiring platform → do services → AI propose kare, code execute kare → production controls + evals → AgentCore coding agent.

---

## 2. Architecture (whiteboard pe aise banao)

```
Browser ──► Next.js (AWS Amplify) ──JWT──► Python agent-service (Render, FastAPI + LangGraph)
                │                                   │
                ├── login, billing, emails,         ├── 13 agents (screening, copilot, committee,
                │   DB writes, bookings             │   coding assessment, FAQ, ...)
                ▼                                   ├── LLM gateway: OpenAI → Groq fallback
        PostgreSQL (Neon) ◄─────────────────────────┤   Postgres: memory, jobs, run history, flags
                                                    └── AWS Bedrock AgentCore (code sandbox)
                                                        Pinecone (RAG), Langfuse (traces)
```

**3 design rules (inhe zaroor bolna):**
1. **AI propose kare, code execute kare.** Agent sirf suggest karta hai; email/booking/DB change Next.js karta hai.
2. **Decision rules code mein, AI mein nahi.** Screening score AI deta hai, lekin shortlist ≥75 / reject <50 **code** decide karta hai. Committee ki ranking bhi code.
3. **Insaan pe asar → insaan ka approval.** AI "reject" ya "interview book" bole to system rukta hai, recruiter confirm karta hai (LangGraph `interrupt` + Postgres checkpointer — server restart ke baad bhi wahin se continue).

---

## 3. Asli numbers (sirf yahi bolo)

| Cheez | Number |
|---|---|
| AI agents | 13 (LangGraph) |
| Unit tests | 178 (fake LLM, har push pe) |
| Real-LLM eval suites | 7 suites, 17 metrics, har case 3 baar — abhi sab 1.00, 0 flaky |
| Injection attacks tested | 11 (English, Hindi, Hinglish, hidden characters…) — 11/11 flagged, 0 false alarms on 49 honest texts |
| Fairness | 3 resumes × 9 identity variants — strong/mid-level pe ±2 points |
| FAQ agent | 40% → 100% accuracy (eval set pe) jab single-search se ReAct banaya |
| Cost | screening ≈ $0.0003 · coding review ≈ $0.0025 · poora CI eval run ≈ $0.40 |
| **Production usage** | **Chhota: 6 users, 14 interview sessions** — ye personal project hai, real traffic nahi |

> ⚠️ "Thousands of users" jaisa kuch **kabhi mat bolna**. Agar scale pooche: "user scale small hai, maine impact quality aur reliability mein measure kiya, aur system ko scale ke liye design kiya" (detail section 6 mein).

---

## 4. Teen kahaniyan (STAR style — Situation, Task, Action, Result)

### Kahani A — Coding round jo code sach mein chalata hai (AgentCore)
- **Situation:** coding interview mein LLM sirf code *padh ke* "correct" bolta tha — score andaza tha.
- **Action:** naya LangGraph agent: (1) sawaal se tests + do reference solutions banata hai, (2) references sandbox mein chala ke expected output nikalta hai, (3) candidate ka code **alag fresh AgentCore session** mein chalta hai — no network, timeout, (4) score **tests** se, LLM sirf code quality batata hai.
- **Result:** sahi code har test pass, galat code 100% pakda (eval, 3×). Production mein live.
- **Twist (bolna — impressive hai):** production ke pehle test mein brackets wale sawaal pe fail hua — model ka JSON toot raha tha (5 mein 2 baar). Fix: provider ka JSON mode → 8 mein 0 fail.

### Kahani B — Evals ne asli bugs pakde
- Hiring committee strong aur average **dono ko 72** de raha tha, average shortlist ho gaya. Wajah: prompt ke example JSON mein `72` likha tha — model copy kar raha tha (**anchoring**). Fix: har answer pehle grade karo → 95 / 65 / 30.
- Injection detector Hindi/Hinglish attacks miss kar raha tha → patterns jode, false alarms bhi test kiye.
- Coding agent: "sort bhool gaya" wala galat code kabhi-kabhi pass — 3× runs ne pakda; 7 alag wajahein mili (galat comparison mode, saare tests ek call mein, AI ka banaya galat "example"…), sab theek kiye.

### Kahani C — Production outage pakda
- Smoke test mein dekha: Copilot ke endpoints **404**. Jaanch ki — Render pe auto-deploy band tha, agent-service **25 commits peeche** tha jabki frontend latest tha. Auto-deploy on kiya, deploy kiya, endpoints aur ek asli job verify ki.
- **Seekh:** tests + evals ke baad bhi **deploy ke baad ek asli check** zaroori hai.

---

## 5. Production controls (ek line mein har ek)

| Control | Kya karta hai |
|---|---|
| Version pinning | Model dated snapshot pe pinned (`gpt-4o-mini-2024-07-18`); har run ka fingerprint (model+prompt+tools+KB); rollback ek command |
| Run guards | Har run: timeout, max steps (loop guard), token + $ budget; 5 fail lagatar → agent 60s ke liye band (circuit breaker) |
| Kill switch | Admin kisi agent ko `off` / `read_only` kar sakta hai, bina deploy ke |
| Audit | Har tool call, approval, flag change log — arguments ka sirf hash (PII nahi) |
| Guardrails | Resume ko "data" tag mein band karna, injection detect, contact details mask, bias wale reasons hatana |
| Observability | Langfuse traces, per-agent error rate / p95 / cost, alerts, run-history dashboard |
| Feedback loop | 👎 → review → eval case → agli baar wahi galti CI mein pakdi jaaye |

---

## 6. Counter questions — imaandaar jawab

### Scale aur impact
**Q: Kitne users hain? Scale kya hai?**
> "User scale small — it's a personal project with a handful of users (6 users, 14 interview sessions). I measured impact on quality and reliability instead: FAQ accuracy 40→100% on an eval set, coding grading moved from LLM opinion to executed tests, injection and fairness gated in CI. For scale I designed fan-out jobs (50 resumes, 100 candidates in parallel with a concurrency cap) and per-run cost budgets."

**Q: 40% → 100% kis pe measure kiya?**
> "On a labelled eval set — 6 FAQ questions written with different wording than the docs, plus one the docs don't cover. Small set, so I treat it as a regression gate, not a statistic."

**Q: Ye numbers chhote eval sets pe hain, to kitna bharosa?**
> "Fair point — that's why every case runs 3 times and I list flaky ones, and a drop from the baseline fails CI. Growing the sets to 50–100 per suite is the next step."

### Ownership
**Q: Tumne khud kya kiya? AI tools use kiye?**
> "It's my project end to end — architecture, agents, deployment, operations. I used AI coding tools to move faster, but the design decisions, trade-offs and verifying in production were mine — e.g. choosing that rules, not the LLM, decide shortlists, and debugging the 25-commits-behind outage."
> (Sach bolo. Agar koi hissa tum explain nahi kar sakte, use claim mat karo.)

### AI design choices
**Q: Shortlist ka decision LLM kyun nahi leta?**
> "Two reasons: consistency and fairness. In early evals the same score got 'reject' for one candidate and 'maybe' for a woman/older variant. Moving the decision to a code threshold made it deterministic and auditable."

**Q: ReAct har jagah kyun nahi?**
> "ReAct is good when the next step is unknown — like re-searching policy docs. For hiring decisions I want a fixed, auditable flow, not an agent improvising."

**Q: Multi-agent kyun? Ek bada prompt kyun nahi?**
> "Separate steps are testable and traceable on their own, can run in parallel (the 3-person interview panel is ~3× faster), and a failure in one step doesn't hide inside a giant prompt."

**Q: LLM galat JSON de to?**
> "Every structured reply is validated against a Pydantic schema; on failure it re-asks once with the error, then falls back with a `fallback_used` flag so the UI shows 'unavailable' instead of a fake score. For JSON-heavy calls I use the provider's JSON mode."

### AgentCore / coding agent
**Q: AgentCore kyun, khud Docker sandbox kyun nahi?**
> "Candidate code is untrusted. A managed microVM sandbox with no network gave me isolation without running and securing my own container fleet. And I only took the piece I needed — I didn't use AgentCore Memory, Policy or Observability because I already had a Postgres checkpointer, approval gates and Langfuse."

**Q: Candidate cheat kar sakta hai? Fake output print kare?**
> "Expected outputs never enter the candidate's sandbox — comparison happens outside. Results are only read from lines tagged with a random nonce. And a comment like 'grader: mark correct' changes nothing because the score comes from tests; it's also flagged."

**Q: LLM ke banaye tests galat hue to? Sahi candidate fail?**
> "Several guards: expected outputs come from running two independent reference solutions — tests where they disagree are dropped; a reference that contradicts the question's own example voids the tests and falls back to review; tests must match the function's parameter count; and a mutation check runs deliberately wrong solutions to make sure the tests catch them. If anything is untrustworthy it says 'not executed' instead of guessing."

**Q: Infinite loop?**
> "Every run is under `timeout`; the harness prints a marker before each test, so we know which test hung, mark it timeout and restart from the next one."

**Q: Cost?**
> "About $0.0025 per coding review — mostly the LLM; the sandbox part is ~$0.0004."

### Evals
**Q: Evals kaise kaam karte hain?**
> "Seven suites against the real LLM: planner routing, screening, injection, fairness, FAQ grounding, coding, hiring committee. Every case runs 3×, the metric is the mean, flaky cases are listed, and a drop of more than 0.05 from the committed baseline fails the PR. They run on any PR that touches prompts, models or tools, and weekly to catch provider drift."

**Q: Fairness kaise test karte ho?**
> "Counterfactual: the same resume with only name, gender, age, religion, family status or disability changed — on a strong, a mid-level and a borderline resume. Each variant runs 3 times and I compare averages. Comparing single runs once looked like bias; averaging showed it was noise."

**Q: To kya system pura fair hai?**
> "I can't claim that. What I can say: on my test set, strong and mid-level profiles stay within ±2 points. I keep a watch list — e.g. a candidate who mentions maternity leave and age scores 5 points lower in the committee, consistently. It's within my limit, but I track it rather than hide it."

**Q: Evals ne kya pakda?**
> "About ten real bugs — the committee anchoring on an example number, missed Hindi/Hinglish injections, seven separate weaknesses in the coding agent's test generation — plus two of my own mistakes: a wrong eval label, and a first baseline that could be saved from a failing run."

### Security & privacy
**Q: Resume mein prompt injection?**
> "Candidate text is fenced in tags the prompt declares as data, tag break-outs and hidden characters are neutralised, known patterns are detected (English and Hindi/Hinglish) and routed to human review. Detection is a flag, not the only defence — the decision is rule-based and humans approve rejections."

**Q: PII?**
> "Emails and phones are masked before resume text goes to the LLM; Langfuse traces have content masked; audit logs store argument hashes, not values; feedback is stored with contact details masked."

**Q: Services ke beech auth?**
> "Next.js signs a short-lived HS256 JWT per request with the user, org and role; the agent service verifies it and never trusts a user id from the request body. Admin endpoints check the role."

**Q: AWS keys?**
> "Least privilege: a dedicated IAM user for the sandbox with only the three Code Interpreter actions, and a separate one for CI — so a leak can only start sandboxes."

### Reliability
**Q: OpenAI down ho jaaye to?**
> "The gateway falls back to Groq per call, with retries and backoff; tools have circuit breakers; agents have their own breaker and a kill switch."

**Q: Agent loop mein phans jaaye?**
> "Recursion limit per run, a wall-clock timeout, and a token and dollar budget checked before every LLM call — even if a node swallows the error, the run is still marked over budget."

**Q: Deploy kharab ho jaaye to?**
> "Roll back on Render to the previous deploy; models and KB config are pinned in a releases file with a one-command rollback; and the kill switch can turn an agent off or read-only without a deploy."

### Weaknesses (khud se bolna achha lagta hai)
**Q: Kya behtar karoge? Kamzoriyan?**
> "Three things: real traffic — the usage is small; bigger eval sets (50–100 cases per suite) and evals for the agents that don't have them yet (job-match, interview panel and others); and validating my LLM judge for FAQ faithfulness against human labels. Also the free hosting tier has a ~50s cold start that I'd fix with a paid instance."

**Q: Dobara banao to kya alag karoge?**
> "I'd build the eval harness and the run guards first, before the features — most of my bugs were found by evals, and earlier evals would have saved rework. And I'd keep everything on one cloud from the start."

---

## 6.5 MCP — Resume-AI ka apna MCP server (naya kaam)

### Ek line mein
> "I built an MCP server for the platform, so a recruiter can work with their own hiring pipeline from any MCP client — list candidates, read interview results, run AI screening and book interviews — with OAuth scopes and a human confirmation before anything that emails a candidate."

### MCP kya hai (simple)
- **MCP = AI ke liye USB port.** Ek standard tarika jisse koi bhi AI app (Claude Desktop, Claude Code, apna agent) kisi bhi system ke tools aur data use kar sake — har app ke liye alag integration likhne ki zaroorat nahi.
- **Teen roles:** **Host** (jo app user chalata hai, jaise Claude Desktop) → uske andar **Client** → jo **Server** se baat karta hai (humara Resume-AI server).
- **Server teen cheezein deta hai:**
  - **Tools** = kaam (model chalata hai): `search_candidates`, `book_interview`…
  - **Resources** = padhne ka data (app/user chunta hai): `campaign://{id}`, `candidate://{id}`, hiring policy
  - **Prompts** = tayyar templates (user chunta hai): "review-campaign", "interview-kit"

### Kya banaya (asli numbers)
| Cheez | Detail |
|---|---|
| Endpoint | `/api/mcp` — Next.js route, official TypeScript SDK v2 |
| Protocol | Latest spec **2026-07-28** (stateless) + purane 2025 clients bhi chalte hain |
| Tools | 8 — 4 read-only, 3 AI kaam (agent-service ke LangGraph agents chalate hain), 1 destructive (`book_interview`) |
| Resources | 2 templates + 1 static policy doc, cache hints ke saath |
| Prompts | 2, **autocomplete** ke saath (recruiter ke apne campaign names) |
| Test | Official MCP client se **26-check contract test** — sab pass (local) |

### Concepts jo use kiye (har ek ka "kyun")
| Concept | Kyun / kaise |
|---|---|
| **Stateless protocol (2026-07-28)** | Har request apni version + client info khud le ke aati hai, koi session nahi. Serverless (AWS Amplify) pe perfect — koi bhi instance koi bhi request le sakta hai |
| **Tool annotations** | `readOnlyHint`, `destructiveHint`, `idempotentHint` — client ko pata chalta hai kaunsa tool khatarnak hai, wo extra confirmation maang sakta hai |
| **Structured output** | Har tool ka `outputSchema` + `structuredContent` — AI ko text nahi, pakka JSON milta hai |
| **Pagination** | Opaque cursor, deterministic order — badi lists ek baar mein nahi |
| **Progress + cancellation** | AI screening ~10s: har graph step ka progress client ko jaata hai; client cancel kare to polling turant rukti hai |
| **Job handles** | Lamba kaam (ranking, minutes) → tool turant ek handle deta hai, `get_job_result` se baad mein result. Ye naye spec ka recommended stateless tareeka hai |
| **Scopes per tool** | `candidates:read`, `screening:run`, `interviews:write`. Read-only token se booking try → **403 insufficient_scope** → client sirf wahi extra permission maangta hai (incremental consent) |
| **MRTR (Multi Round-Trip Requests)** | Naye spec mein server beech mein client se kuch "pooch" nahi sakta; wo `input_required` result lautata hai, client jawab le ke **wahi call dobara** bhejta hai |
| **Elicitation (human confirmation)** | `book_interview` pehle recruiter se confirm karwata hai. 3 tarike, client ki capability dekh ke: **form**, **URL-mode**, aur purane clients ke liye **approval link** |
| **Signed requestState** | MRTR ka state client ke through ghoomta hai, to use **HMAC se sign** kiya aur **user se bind** kiya — client badal nahi sakta, doosra user replay nahi kar sakta |
| **No token passthrough** | Recruiter ka MCP token agent-service ko kabhi nahi jaata; wahan ke liye alag service token banta hai (confused-deputy attack se bachav) |
| **Audience check** | Token sirf `…/api/mcp` ke liye maana jaata hai — kisi aur service ka token yahan nahi chalega |
| **Security basics** | Origin header check (DNS rebinding), rate limit, har tool call ka audit log (arguments ka sirf hash), candidate emails masked |

### Sabse achhi kahani — "approval link" kyun bana
- **Kya hua:** contract test mein purane (2025) client se booking pe error aaya — *"cannot request input: per-request legacy serving cannot receive server-to-client requests"*.
- **Kyun:** purane protocol mein server ko beech mein client se poochne ke liye **session** chahiye, aur hum stateless hain. Aur aaj bhi kai clients (Claude Desktop) purane protocol pe hain.
- **Kya kiya:** aise clients ko tool ek **approval link** deta hai. Recruiter browser mein login karke "Approve" dabata hai — **booking wahi hoti hai, AI ke kehne se nahi**. AI dobara poochhe to "already booked".
- **Kyun ye form se bhi safe hai:** form ka jawab client deta hai (theory mein AI bhi bhar sakta hai); approval button sirf recruiter ke logged-in browser mein hai.
- **Achhi baat:** galti safe tareeke se fail hui — booking hui hi nahi, saaf error aaya.

### Ek imaandar seekh (poochein to bolo)
> "In my first test run an email actually went out — I'd restarted the dev server with SMTP disabled, but the restart failed and the old server, with SMTP on, kept serving. It went to a reserved example.com address, so it reached no one, but it taught me two things: verify the process you think you're testing, and make side effects explicit — I added an `MCP_SEND_EMAILS=false` dry-run switch, and the contract test now asserts no email left the server."

### Kya ABHI baaki hai (yeh zaroor pata ho)
- **Apna OAuth 2.1 server** (login, consent screen, PKCE, Client ID Metadata Documents) — abhi testing dev-token script se hoti hai. **Iske bina Claude Desktop se connect nahi hota.**
- `subscriptions/listen` (live updates), Python agent-service ko official MCP client pe le jaana, CI mein contract test, OpenTelemetry tracing.
- Production deploy abhi nahi hua — sab local pe test hua hai.

### Counter questions
**Q: MCP aur normal REST API mein kya farak hai?**
> "REST is built for a specific frontend. MCP is a standard for AI clients: the client discovers tools at runtime, gets JSON Schemas and annotations so the model knows how and when to call them, and the protocol has AI-specific pieces — asking the user mid-call, progress, scopes the client can request on demand. Any MCP host can use my server without custom code."

**Q: AI khud booking approve kar de to?**
> "It can't. book_interview is marked destructive, needs the `interviews:write` scope, and always asks for a human confirmation. For older clients the confirmation is an approval link that only works in the recruiter's logged-in browser — the booking happens there, not in the tool."

**Q: Sampling kyun use nahi kiya?**
> "Sampling is deprecated in the 2026-07-28 spec — the guidance is to call the model provider directly. My server calls its own LLM through agent-service, so it doesn't need to borrow the client's model."

**Q: Roots / Logging?**
> "Both deprecated in 2026-07-28. My server works on campaign and candidate ids passed as tool arguments, not file-system roots; and for logs I use structured audit lines and tracing instead of MCP logging."

**Q: Stateless kyun?**
> "It runs on serverless (AWS Amplify): any instance can take any request, nothing to pin or lose. Cross-call state is explicit — a signed `requestState` for confirmations and a job handle for long work."

**Q: MCP server pe prompt injection?**
> "Two directions. Candidate text inside results is data — the server's instructions say so and the platform already detects injection in resumes and answers. And the server never treats the client's text as authority: scopes, ownership checks and the human confirmation are enforced in code."

**Q: Ek recruiter doosre ka data dekh sakta hai?**
> "No — every query is scoped to the token's user in one data layer; the contract test checks that another user gets 'not found'."

**Q: Kitne log ise use karte hain?**
> "Nobody in production yet — it's tested locally with the official MCP client; the OAuth server and deployment are the next steps."

## 7. Mat bolna (trap)

- ❌ "Thousands of users" / "production traffic" — sach: 6 users.
- ❌ "100% fair" / "bias-free" — sach: test set pe ±2, aur ek watch list hai.
- ❌ "Maine AI tools use nahi kiye" — agar kiye hain to maano, aur bolo ki faisle tumhare the.
- ❌ "Railway pe deployed" — agent-service **Render** pe hai, frontend **AWS Amplify** pe, DB **Neon**.
- ❌ "Claude Desktop se connected hai" / "MCP production mein hai" — sach: local pe tested, OAuth aur deploy baaki.
- ❌ Koi number jo is file mein nahi hai.

---

## 8. Interview se pehle 15 minute ka revision

1. Section 1 ka pitch zor se 2 baar bolo.
2. Architecture diagram ek kaagaz pe banao (section 2).
3. Teen kahaniyan (section 4) — har ek 1 minute mein.
4. Section 6 mein se ye 5 pakke karo: scale, ownership, AgentCore kyun, fairness, kamzoriyan.
4b. Section 6.5 (MCP): "MCP kya hai", approval link wali kahani, aur "kya baaki hai" — teeno pakke karo.
5. Code mein ek baar dekh lo: `agent-service/core/observability.py` (`run_agent`), `agent-service/agents/code_assessment/nodes.py`, `agent-service/evals/run_evals.py`.
