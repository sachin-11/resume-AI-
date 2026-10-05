# AI Resume Coach — Complete Project Guide (HLD · LLD · Deployment · Interview Q&A)

> **Ek file mein poora project:** kya hai → kaise bana hai (HLD) → andar se kaise chalta hai (LLD) → har important flow step-by-step → deployment → interview mein deep sawaalon ke jawab.
>
> **Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL + Prisma · Python FastAPI + LangGraph · Groq / OpenAI · Pinecone · Langfuse · AWS (Amplify, S3, SNS) · Railway · Stripe
>
> **Size:** 34 pages · 108 API routes · 23 DB models · 10 LangGraph agents · 100 agent unit tests · real-LLM eval suite · CI

---

## Table of Contents

1. [Product — kya hai, kiske liye](#1-product--kya-hai-kiske-liye)
2. [Features (module-wise)](#2-features-module-wise)
3. [Tech stack — kya aur kyun](#3-tech-stack--kya-aur-kyun)
4. [HLD — High Level Design](#4-hld--high-level-design)
5. [LLD — Next.js app](#5-lld--nextjs-app)
6. [LLD — Agent service (Python, LangGraph)](#6-lld--agent-service-python-langgraph)
7. [Key flows — step by step](#7-key-flows--step-by-step)
8. [Cross-cutting: security, privacy, reliability, cost](#8-cross-cutting-security-privacy-reliability-cost)
9. [Testing, evals, CI](#9-testing-evals-ci)
10. [Deployment — local se production tak](#10-deployment--local-se-production-tak)
11. [Deep-dive Q&A (interview prep)](#11-deep-dive-qa-interview-prep)
12. [Known limitations & next steps](#12-known-limitations--next-steps)

---

## 1. Product — kya hai, kiske liye

Ek **AI-powered HR platform** jo do taraf ke users ko serve karta hai:

| User | Role | Kya milta hai |
|---|---|---|
| **Job seeker** | `candidate` | Resume analysis + ATS score, AI mock interviews (voice/video), feedback, job-apply assistant, auto job search |
| **Recruiter / company** | `recruiter`, `admin`, `viewer` | Bulk interview campaigns, candidate invites + proctored interviews, comparison, AI screening, multi-agent **Recruitment Copilot**, analytics, ATS webhooks |
| **Platform admin** | `admin` | Users/plans management, AI cost dashboard |

Business model: **Free** (5 interviews/month) → **Pro** → **Enterprise** (team + campaigns), Stripe subscriptions.

---

## 2. Features (module-wise)

### 2.1 Resume intelligence
- PDF/DOCX upload (`pdf-parse`, `mammoth`) → text extract → AI analysis: skills (categorised), experience, score 0–100, career suggestions, improved summary
- **ATS match** — resume vs JD: matched/missing keywords, match %
- **Resume Improvement Agent** (LangGraph) — rewrite → re-score loop jab tak ATS score ≥ 70 ya 3 iterations
- Bulk resume upload (recruiter), difficulty auto-suggest
- Resume chunks **Pinecone** mein index hote hain (RAG ke liye); delete par vectors bhi clean

### 2.2 AI mock interview engine (core)
- **4 round types** (technical, HR, behavioral, system design) × **3 difficulty** (beginner/intermediate/advanced)
- **9 interviewer personas** (friendly, strict, conversational, React/DevOps/Node.js expert, Google/startup/Amazon style)
- Question generation: **60% resume-based (RAG) + 40% general**, custom question bank mix, MCQ / free text / **coding** (Monaco editor + starter code + AI code review)
- Per answer: confidence analysis → **adaptive follow-up**, **adaptive difficulty checkpoint** (beech mein difficulty up/down), hints
- Warmup flow, skip, "end intent" detection
- **Voice:** browser STT + TTS; **audio recording → S3**, server-side transcript (Groq **Whisper** `whisper-large-v3-turbo`)
- **Panel mode:** Technical / HR / Domain AI interviewers
- UI languages: English, Hindi, Spanish, French

### 2.3 Feedback & scoring
- Overall / technical / communication / confidence (0–100) — AI scores **clamped & validated** before DB
- Strengths, weak areas, better-answer examples, improvement roadmap
- Fallback feedback ko **`isFallback`** flag — recruiter/candidate ko "Score unavailable" dikhta hai, fake score nahi
- PDF / TXT export

### 2.4 Proctoring & integrity
- Tab switch, multiple faces / no face / looking away, background noise, copy-paste
- Integrity flag: clean / warning / suspicious + violation timeline
- **Coverage flags** — "clean" ka matlab ye nahi maana jaata ki camera monitoring chali thi, agar client par chali hi nahi

### 2.5 Recruiter: bulk campaigns
- Campaign (role, round, difficulty, question count) → candidates (email chips / CSV import) → branded invite email ya link-only
- Candidate status: pending → started → completed → abandoned; end snapshot photo; audio playback (S3 presigned URL)
- 2–4 candidates **side-by-side comparison**, private notes, retake, CSV export, bulk feedback email
- **Interview slots** — candidate apna slot book karta hai (atomic booking, reschedule par purana slot free)
- **Auto-shortlist** by score threshold + **webhooks** (Slack / Greenhouse / Lever / Workday / custom, HMAC-signed)

### 2.6 Recruiter: AI agents
- **Candidate Screening** — resume vs JD + **GitHub verification** (repos/languages), requirement-by-requirement checks, guardrails
- **3-agent Interview Panel** — Technical (50%) + HR (25%) + Domain (25%), **parallel**, consensus + majority vote
- **Recruitment Copilot** (chat) — multi-step ("screen karo, shortlist ho to interview book karo"), conversation memory, **human approval** before reject / booking + email, live progress

### 2.7 Job seeker: job tools
- **Job Agent** — JD paste ya URL scrape → gap analysis, cover letter, tailored bullets, interview prep, ATS score, company research, salary tips, LinkedIn message, follow-up email, HR email send
- **Job Match Agent** — 6-step deep report (JD parse → match → mock interview → salary → strategy)
- **Auto-Apply Agent** — live job search (JSearch / Brave Search MCP) → match score → tailored resume + cover letter → tracker (found → applied → interview → offer/rejected). **Koi fake listing nahi** — source na ho to clear message
- **Learning Path**, **Market Intelligence**, **Daily Ops** (pasted emails/notes → standup/summary) agents
- **Interview Copilot** (live practice) — laptop + phone link (QR/code), speech → AI suggested answer

### 2.8 Platform
- Dashboard analytics (trends, by role/difficulty, campaign pass rate, date filters)
- **AI Assistant** — natural language → safe Prisma query plan → answer (userId hamesha forced)
- Auth: email/password, Google OAuth, phone OTP (AWS SNS), forgot/reset password, candidate portal login
- Teams/orgs with roles; Stripe billing (checkout, portal, webhook, usage limits)
- GDPR: export my data (JSON), delete account (cascade)
- Admin: users/plans, **AI cost dashboard** (per feature, per interview)
- Dark/light mode, mobile responsive

---

## 3. Tech stack — kya aur kyun

| Layer | Choice | Kyun |
|---|---|---|
| Web app | **Next.js 16** App Router, React 19, TypeScript, Tailwind v4, shadcn-style UI | Ek codebase mein UI + API routes; server components; Amplify par serverless deploy |
| DB | **PostgreSQL + Prisma 5** | Relational data (users → campaigns → invites → sessions → answers), migrations, type-safe queries |
| Auth | **NextAuth v4** (JWT sessions) | Credentials + Google; session mein `role` + `orgId` |
| LLM (web) | **Groq** llama-3.3-70b (primary) → **OpenAI** gpt-4o-mini (fallback) | Groq fast + sasta; fallback se uptime |
| Agents | **Python FastAPI + LangGraph** (alag service) | Stateful multi-step agents, loops, interrupts, checkpointing — Python ecosystem best hai |
| LLM (agents) | OpenAI primary → Groq fallback, LangChain wrappers | Structured output reliability |
| Vector DB | **Pinecone** | Resume RAG + company policy docs (FAQ) |
| Observability | **Langfuse** (dono services) + `AiUsageLog` table | Per-node traces + cost; PII masked |
| Storage / SMS / Email | S3 (audio), SNS (OTP), Nodemailer SMTP | — |
| Payments | Stripe | Subscriptions + webhooks |
| Hosting | **AWS Amplify** (Next.js), **Railway** (agent-service) | Managed, git-push deploy |
| Validation | Zod (TS), Pydantic (Python) | Har boundary par schema |

---

## 4. HLD — High Level Design

### 4.1 Architecture

```
                                   ┌────────────────────────── AWS Amplify ──────────────────────────┐
  Browser (React 19)               │  Next.js 16                                                      │
  ├─ dashboard pages ──── HTTPS ──►│  proxy.ts  (auth gate · per-IP rate limits · security headers)  │
  ├─ candidate invite pages        │  app/(dashboard), app/(auth), app/interview, app/candidate       │
  └─ polls agent jobs (1s)         │  app/api/*  (108 route handlers)                                 │
                                   │     lib/groq.ts ──► Groq (llama-3.3-70b) ──fallback──► OpenAI   │
                                   │     lib/rag.ts  ──► Pinecone (resume chunks)                      │
                                   │     lib/s3, sns, mailer, stripe, webhooks                         │
                                   └───────┬───────────────────────┬──────────────────────────────────┘
                                           │ Prisma                │ HTTPS + per-user signed JWT (2 min)
                                           ▼                       ▼
                               ┌────────────────────┐   ┌──────────────────── Railway ───────────────────┐
                               │ PostgreSQL          │   │ agent-service (FastAPI + LangGraph)             │
                               │  public schema:     │◄──┤  core/: auth · llm gateway · memory · jobs ·    │
                               │   23 Prisma models  │   │         tools · mcp_pool · guardrails · ratelim │
                               │  agent_memory:      │   │  agents/: orchestrator (planner+supervisor),    │
                               │   checkpoints*,     │   │   screening, panel, scheduler, faq, job_match,  │
                               │   agent_jobs        │   │   auto_apply, learning_path, market, daily_ops  │
                               └────────────────────┘   │  background job workers (SKIP LOCKED)           │
                                                         └──┬──────────┬──────────┬──────────┬─────────────┘
                                                            ▼          ▼          ▼          ▼
                                                     OpenAI/Groq   Pinecone   GitHub API   JSearch / Brave
                                                                   (policies) + GitHub MCP  (MCP) job search
                        Langfuse ◄── traces (masked) from both services        Stripe ──► /api/billing/webhook
```

### 4.2 Do services kyun?

| | Next.js app | agent-service |
|---|---|---|
| Kaam | UI, auth, CRUD, interview engine, billing, emails, file upload | Long-running multi-step AI agents |
| Kyun alag | Serverless request-response ke liye perfect | Agents ko loops, state, checkpoints, background workers, Python libs (LangGraph) chahiye |
| Side effects | **Saare** (DB writes, emails, slot booking, payments) | **Koi nahi** — sirf read tools; actions human approval ke baad Next.js karta hai |
| Data | Prisma `public` schema | Same Postgres, alag `agent_memory` schema (Prisma migrations ko "drift" na lage) |

### 4.3 Communication
- Next.js → agent-service: HTTPS, har request par **per-user JWT** (HS256, `sub`=user, `org`, `role`, `aud=agent-service`, 2 min expiry).
- Lambi runs (screening, panel, Copilot) → **job queue**: `POST /jobs` → `202 {job_id}` → browser `/api/agent-jobs/[id]` poll karta hai (progress + result).
- Agent-service kabhi Next.js ko call nahi karta (one-way dependency).

### 4.4 Non-functional design goals
| Goal | Kaise |
|---|---|
| Reliability | LLM provider fallback, retries, circuit breakers, durable jobs, checkpointed conversations |
| Security | JWT per user, role permissions, least-privilege tools, injection guardrails, HMAC webhooks, CSP/HSTS |
| Privacy | PII masked before LLM + Langfuse, first-party storage, GDPR export/delete |
| Cost | Per-call token + cost logging (`AiUsageLog` + Langfuse), plan limits, rate limits |
| Quality | Pydantic-validated LLM outputs, flagged fallbacks, real-LLM evals in CI |

---

## 5. LLD — Next.js app

### 5.1 Repo structure
```
app/
  (auth)/            login, register, forgot/reset password
  (dashboard)/       dashboard, upload-resume, resume-report, resume-improve, interview/{setup,session,copilot},
                     history, feedback, job-agent, job-match(-agent), auto-apply, ai-agents, recruiter-copilot,
                     campaigns(+compare), chat, question-bank, team, settings(+webhooks), billing, admin
  interview/         public candidate pages: invite/[token], schedule/[token], phone (copilot link)
  candidate/         candidate portal login + portal
  api/               108 route handlers (interview 20, job-agent 12, campaigns 11, auth 9, resume 8, …)
components/          ui/ (button, card, …), layout/ (sidebar), interview/, feedback/
hooks/               use-speech, use-camera, use-audio-recorder, use-proctoring
lib/                 groq (LLM), prompts, rag, auth, permissions, rate-limit, mailer, s3, sns, stripe, webhooks,
                     db-chat, agentAuth/agentJobs/agentJobClient (agent-service client), …
prisma/              schema.prisma + 30 migrations
proxy.ts             Next 16 middleware: auth gate, rate limits, security headers
agent-service/       Python FastAPI + LangGraph (section 6)
```

### 5.2 Data model (23 Prisma models)

| Group | Models | Notes |
|---|---|---|
| Identity | `User`, `Organization`, `TeamMember`, `PasswordResetToken`, `PhoneOtp` | `User.role` (admin/recruiter/viewer/candidate), `plan`, `interviewsThisMonth`, `orgId` |
| Resume | `Resume`, `JobDescription`, `ResumeMatch` | `rawText` + `analysisReport` (JSON) |
| Interview | `InterviewSession`, `Question`, `Answer`, `FeedbackReport`, `QuestionBank` | Session: config, status, integrity flags, audio key, panel/adaptive fields; FeedbackReport: scores + `isFallback` |
| Campaigns | `InterviewCampaign`, `CandidateInvite`, `CandidateNote`, `InterviewSlot` | Invite `token` = candidate ka secret; slot `isBooked` |
| Job tools | `JobApplication`, `AutoApplyJob`, `AutoApplySettings` | Auto-apply `source` = jsearch / brave-search |
| Platform | `WebhookConfig`, `AiUsageLog`, `CopilotLinkSession` | `AiUsageLog`: feature, provider, model, tokens, `costUsd` |

Agent-service apni tables `agent_memory` schema mein khud banata hai: LangGraph `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`, aur `agent_jobs`.

### 5.3 Auth & authorization
1. **NextAuth** (`lib/auth.ts`): Credentials (bcrypt, login rate-limited per IP+email) + Google OAuth. JWT session mein `id`, `role`, `orgId`.
2. **Phone OTP** — AWS SNS se SMS, `PhoneOtp` table.
3. **Candidate (invite) access** — public routes `sessionId` + invite `token` dono verify karte hain (`lib/candidateInvite.ts`) — sirf guessable cuid kaafi nahi.
4. **Permissions** (`lib/permissions.ts`) — role → features (e.g. `useRecruiterCopilot: admin, recruiter`); sidebar role ke hisaab se.
5. **`proxy.ts`** (Next 16 middleware) — protected prefixes par login redirect, `/admin` sirf admin, per-IP API rate limits (e.g. chat 20/min, resume upload 5/min, recruiter copilot 20/min), security headers (CSP, HSTS, X-Frame-Options DENY, nosniff).

### 5.4 LLM layer (web) — `lib/groq.ts`
- `callGroq()` → Groq llama-3.3-70b; fail → **5 min Groq cooldown** + OpenAI gpt-4o-mini fallback; OpenAI quota hit → admin alert email (1/hour throttle).
- Har call: tokens → `AiUsageLog` (cost via `lib/pricing.ts`, dated model names prefix-match) + Langfuse generation (**content redacted**, sirf lengths).
- Prompts: `lib/prompts.ts`; personas: `lib/personas.ts`.

### 5.5 RAG — `lib/rag.ts`
- **Index:** resume text → 500-word chunks (100 overlap) → OpenAI `text-embedding-3-small` (fallback: deterministic hash embedding) → Pinecone (metadata: resumeId, userId).
- **Retrieve:** query `"{role} {roundType} interview questions skills experience"`, filter `userId`, top-5, score > 0.3.
- **60/40 split:** prompt-level instruction (`resumeCount = round(count × 0.6)`), questions `source: resume | general`.

### 5.6 Agent-service client (Next.js side)
- `lib/agentAuth.ts` — `agentHeaders(user)` → signed JWT (+ legacy secret during migration).
- `lib/agentJobs.ts` — `submitAgentJob()` → `202 {jobId}`.
- `app/api/agent-jobs/[id]` — owner-only job status proxy; finished job ki usage **exactly once** `AiUsageLog` mein (`ack-usage`).
- `lib/agentJobClient.ts` — browser: `runAgentJob()` poll (1s → 2.5s) + `progressLabel()` ("Checking GitHub…").

---

## 6. LLD — Agent service (Python, LangGraph)

### 6.1 Structure
```
agent-service/
  main.py              FastAPI app: lifespan (checkpointer, job workers, LLM warm-up), middleware, endpoints
  core/
    config.py          settings (models per tier, timeouts, retries, rate limits)
    llm.py             LLM gateway: provider fallback, retry, rate limiter, ainvoke_structured (Pydantic + re-ask)
    auth.py            JWT verify → Caller(user, org, role); legacy secret (migration); resolve_user_id
    ratelimit.py       per-user token bucket (POST endpoints)
    memory.py          AsyncPostgresSaver in agent_memory schema (in-memory fallback); thread_key(user, thread)
    jobs.py            durable job queue (Postgres SKIP LOCKED, lease, heartbeat, idempotency) + progress
    observability.py   Langfuse (masked), run_agent(), usage collector, request IDs
    tools.py           tool registry: risk, allowed agents, timeout, circuit breaker, tracing
    mcp_pool.py        long-lived MCP sessions + per-server tool allowlist
    guardrails.py      injection detect/fence, protected-attribute strip, contact masking
    types.py           Score (0-100), UnitScore, StrList
  agents/
    orchestrator/      Recruitment Copilot: planner → supervisor loop → workers → HITL gates → finalize
    candidate_screening/  extract → fetch_github → match_jd → build_report
    interview_panel/   3 parallel panelists → consensus
    scheduler/  faq/  job_match/  auto_apply/  learning_path/  market_intelligence/  daily_ops/
    shared/            mcp_client.py (stdio JSON-RPC), tools.py (registered tools), eval.py (RAG judge)
  agent/               Resume Improvement agent (rewrite ⇄ score loop)
  tests/               100 unit tests (fake LLM)
  evals/               real-LLM eval suite (cases.py, run_evals.py)
```

### 6.2 LLM gateway — `core/llm.py`
1. `get_llm(temperature, tier)` → primary provider `.with_fallbacks([other])`; `max_retries=2`, `timeout=60`; per-provider **rate limiter** (Groq default 0.5 rps = 30/min).
2. `ainvoke_structured(prompt, Schema, fallback=…)`:
   - reply → JSON extract → **Pydantic validate** (e.g. `Score` 0–100, `Literal` intents)
   - invalid → error ke saath **ek baar re-ask**
   - phir bhi invalid → `fallback` + **`fallback_used=True`** (caller human review flag karta hai)
   - network/provider error → raise (outage ko fake result mein nahi chhupate)

### 6.3 Agents

| Agent | Graph | Notes |
|---|---|---|
| **Orchestrator (Copilot)** | `planner → supervisor ⇄ {resume_screening, scheduling, faq, other} → finalize` | Plan ≤ 3 steps with conditions (`if_shortlisted`); supervisor deterministic; HITL gates (6.5) |
| **Candidate screening** | `extract_info → fetch_github → match_jd → build_report` | Requirement checks with evidence → score rubric → **decision by code** (shortlist ≥ 75, reject < 50) |
| **Interview panel** | `START → {technical, hr, domain} (parallel) → consensus` | Weighted 50/25/25 + majority vote; split → `hold` |
| Resume improvement | `analyze → identify_gaps → rewrite → score_check ⇄ rewrite → finalize` | Stop: score ≥ 70 ya 3 iterations |
| Scheduler | `propose_slots → draft_confirmation` | Calendar MCP (opt-in) → DB slots → generated slots |
| FAQ | `retrieve_docs → answer_question → eval_answer` | Pinecone RAG + LLM-as-judge faithfulness (< 0.5 → review) |
| Job match | 6 nodes | parse_jd → deep_match → mock_interview → salary → strategy → report |
| Auto-apply | `search_jobs → match_and_score → tailor_resume → cover_letter` | JSearch → Brave MCP; grounded listings only; no guessed HR emails |
| Learning path, Market intel, Daily ops | 2–3 nodes | Mostly LLM + deterministic plan math |

### 6.4 State management (LangGraph)
- Har agent ka **typed `TypedDict` state**; nodes sirf changed keys return karte hain.
- Parallel/shared keys par **reducers** (`logs: Annotated[list, operator.add]`, `messages: add_messages`).
- Sub-agents ko orchestrator explicit `sub_state` deta hai; sub-graphs `compile(checkpointer=False)` (unke internals checkpoint mein PII duplicate na karein).
- Copilot per-turn fields har turn reset; context (resume/JD/candidate) thread mein yaad rehta hai.

### 6.5 Human-in-the-loop gates
- `review_rejection`: AI ne `reject` kaha → `interrupt({type: confirm_rejection, …})` → recruiter `reject | maybe | shortlist` + note → report mein `humanReview`.
- `approve_booking`: asli `InterviewSlot` + candidate email → `interrupt({type: book_interview, slots, message})` → recruiter slot chune + email edit kare → `action: approved/declined`.
- Pause **Postgres checkpoint** mein — restart ke baad bhi resume.
- Resume par node dobara chalta hai → booking/email graph ke **bahar** (Next.js, approval ke baad).

### 6.6 Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | status + LLM provider + memory backend |
| `GET /tools` | tool inventory (risk, agents, circuit state) |
| `POST /improve-resume`, `/screen-candidate`, `/panel-interview`, `/generate-learning-path`, `/market-intelligence`, `/daily-ops`, `/job-match-agent`, `/auto-apply` | Agent runs (per-user rate limited) |
| `POST /orchestrate` | Copilot turn (`user` from JWT → thread memory; `409` if approval pending) |
| `GET / DELETE /threads/{id}` | Copilot history (+ pending approval) / delete |
| `POST /threads/{id}/resume` | Recruiter ka approval answer |
| `POST /faq/ingest` | Company policy doc index (Pinecone) |
| `POST /jobs` · `GET /jobs/{id}` · `POST /jobs/{id}/ack-usage` | Background jobs |

---

## 7. Key flows — step by step

### 7.1 Mock interview (candidate)
1. **Setup** — role, round, difficulty, persona, resume, language. `POST /api/interview/create` → plan limit check (`canCreateInterview`: free = 5/month).
2. **Questions** — RAG context (Pinecone) + resume text + question bank → one Groq call (60/40 instruction) → `Question` rows.
3. **Session** — question TTS, candidate answers (text / STT / code editor); camera + proctoring hooks events record karte hain; audio chunks → S3.
4. **Answer** `POST /api/interview/answer`:
   - `Answer` save
   - **parallel:** confidence analysis (→ follow-up question?) + adaptive checkpoint (→ difficulty up/down, remaining questions regenerate)
   - optional hint / code review
5. **Complete** → feedback generation (scores clamped, `isFallback` agar AI fail) → `FeedbackReport`.
6. **After:** usage counter++, transcript (Whisper), emails, webhooks, auto-shortlist (campaign ho to).

### 7.2 Campaign (recruiter → candidate)
1. Campaign create → candidates add (chips/CSV) → `CandidateInvite` (unique `token`) → invite email (Nodemailer) with `/interview/invite/{token}`.
2. Candidate link kholta hai → optional slot booking (`/interview/schedule/{token}`) — **one transaction:** `updateMany(isBooked=false → true)`, count must be 1; reschedule par purana slot free.
3. Interview public routes par (token + sessionId verify), tab-switch/photo/audio upload.
4. `POST /api/interview/public/complete` → feedback → recruiter alert + candidate score report emails → webhooks (`interview_completed`, `score_threshold`) HMAC-signed → auto-shortlist.
5. Recruiter dashboard: status, scores, integrity, audio playback, compare, notes, export.

### 7.3 Recruitment Copilot turn (sabse complex)
1. Recruiter message bhejta hai ("Screen Asha, shortlist ho to interview book karo") + optional context (resume, JD, candidate).
2. Next.js `POST /api/recruiter-copilot`: role check, zod, resume ownership, recruiter ke **future unbooked slots** load → `submitAgentJob("orchestrate")` → `202 {jobId}`.
3. Agent-service: job queue → worker claim (`FOR UPDATE SKIP LOCKED`) → `orchestrate()`:
   - pending approval? → `409`
   - `messages += HumanMessage`, per-turn fields reset, context merge → graph run with `thread_id = user:thread`
4. **planner** → `[resume_screening, scheduling(if_shortlisted)]` (sanitized)
5. **supervisor** → `resume_screening` → screening sub-agent (guardrails, GitHub tools via registry, requirement checks, score → decision)
6. Decision `reject`? → **interrupt** → job result `status: awaiting_approval` → UI approval card
7. Shortlist (ya recruiter ne override kiya) → supervisor → `scheduling` → `approve_booking` interrupt (slot + email)
8. Recruiter approve → `POST /threads/{id}/resume` → run finish → Next.js **atomic slot booking** + candidate email
9. `finalize` → combined reply + review reasons → `AIMessage` history mein; har node ki progress UI par live dikhti rahi

### 7.4 Background job lifecycle
```
submit ─► agent_jobs (queued) ─► worker claim: UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED) (running, lease 60s)
        ─► run graph (ProgressCollector → progress[] every 0.5s, lease extend)
        ─► succeeded(result) | failed(error, code)
worker crash ─► lease expires ─► re-claim (max 3 attempts) ─► else failed
browser poll ─► GET /jobs/{id} (owner only) ─► done ─► ack-usage (once) ─► AiUsageLog
```

### 7.5 Candidate screening internals
1. `extract_info` — resume **fenced** (`<resume>`), email/phone masked; skills + GitHub username; **injection scan** (regex patterns).
2. `fetch_github` — username validation → `github.repos_mcp` (pooled MCP, `search_repositories` allowlisted) → fallback `github.repos_http` (401 → anonymous retry).
3. `match_jd` — fairness rule + untrusted note; model lists **each requirement (met + evidence)** then score (rubric); reasons citing protected attributes removed.
4. `build_report` — score + GitHub boost (≤ 10) → `decide(final_score)`; report: decision, reasons, requirement checks, guardrail findings, `aiFallback`.

---

## 8. Cross-cutting: security, privacy, reliability, cost

| Concern | Implementation |
|---|---|
| **Service auth** | Per-user JWT (HS256 pinned, aud/iss, 2 min); invalid token kabhi legacy secret par downgrade nahi; body `user_id` ≠ token → 403 |
| **Tenant isolation** | Copilot thread key = `user:thread` (regex-validated); jobs owner-only; DB-chat queries `userId` forced |
| **Prompt injection** | Untrusted text fenced + "data, not instructions" note + pattern detection → human review; decision code se (LLM manipulate nahi kar sakta) |
| **Bias** | Fairness rule in prompts + protected-attribute reasons stripped + counterfactual fairness evals |
| **PII** | Email/phone masked before LLM; Langfuse client-level `mask` (strings → `[redacted — N chars]`, unknown types fail-closed); GDPR export/delete |
| **Least privilege tools** | Registry: har tool ke allowed agents, sab read-only; MCP per-server allowlist (GitHub write tools blocked) |
| **Human approval** | Reject + booking/email ke liye `interrupt()` gates |
| **Reliability** | Provider fallback + retries; circuit breaker (3 fails → 60s skip); durable jobs + leases; checkpointed threads; graceful tool fallbacks |
| **Loops** | Resume loop max 3; supervisor index monotonic, plan ≤ 3; LangGraph recursion limit |
| **Rate limits** | Per-IP (proxy.ts), per-user (agent-service token bucket), per-provider LLM limiter, plan quotas |
| **Observability** | Langfuse traces per run (node tree, tokens, cost, latency), request ID in logs + headers, `human_override` score, guardrail events |
| **Cost** | `AiUsageLog` (web + agents, per user/feature) + Langfuse; admin cost dashboard |
| **Data integrity** | Atomic slot booking; no fabricated jobs/emails; flagged AI fallbacks; validated scores |

---

## 9. Testing, evals, CI

### 9.1 Unit tests (`agent-service/tests`, 100 tests, fake LLM — no keys, no cost)
LLM gateway (re-ask, fallback flags) · decision nodes · observability (masking, usage across sub-graphs) · memory (multi-turn, isolation) · auth (forged/expired/alg=none, no downgrade) · HITL (pause, override, forged slot) · tools (allowlist, timeout, circuit breaker, MCP write block) · supervisor (conditional skip/unlock) · parallel panel (fails if sequential) · jobs (ownership, idempotency, crash reclaim) · guardrails · auto-apply integrity.

```bash
cd agent-service && pip install -r requirements-dev.txt && python -m pytest -q tests
```

### 9.2 Real-LLM evals (`agent-service/evals`)
```bash
cd agent-service && python -m evals.run_evals      # writes evals/report.md + report.json, exit 1 on regression
```

| Suite | Checks | Threshold |
|---|---|---|
| Planner | 16 messages → expected plan | ≥ 0.85 |
| Screening | 5 clear-cut cases | ≥ 0.80 |
| Injection | 3 manipulation attempts → not shortlisted + flagged | 1.00 |
| Counterfactual fairness | same resume, sirf naam/gender/age/family/religion/disability badla → same decision, score spread ≤ 10 | 1.00 |

Baseline: **sab 1.00**. Pehli run ne pakda tha: same score par "woman/older/disability" variants ka decision alag aa raha tha → decision ab code se.

### 9.3 CI — `.github/workflows/agent-quality.yml`
- Har PR / master push: agent-service `pytest` + Next.js `tsc --noEmit`
- Manual / weekly: real-LLM evals (needs `OPENAI_API_KEY` repo secret) → report artifact

---

## 10. Deployment — local se production tak

### 10.1 Local setup
```bash
# 1. Web app
npm install                          # postinstall: monaco assets → public/monaco
cp .env.example .env                 # ya .env banao (vars neeche)
npx prisma migrate dev               # Postgres schema
npm run dev                          # http://localhost:3000

# 2. Agent service
cd agent-service
python -m venv venv && venv/Scripts/activate      # (Linux/mac: source venv/bin/activate)
pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8000             # agent_memory tables startup par khud bante hain
```
Windows note: psycopg async Windows ke Proactor event loop par nahi chalta (MCP subprocess ko wahi chahiye) → local Windows par conversation memory + jobs **in-memory**; production (Linux) Postgres.

### 10.2 Environment variables

**Next.js (Amplify):**

| Var | Use |
|---|---|
| `DATABASE_URL` | Postgres |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` | Auth, links in emails |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GROQ_API_KEY`, `OPENAI_API_KEY` | LLM (+ embeddings, Whisper) |
| `PINECONE_API_KEY`, `PINECONE_INDEX` | RAG |
| `ACCESS_KEY`, `SECRET_KEY`, `REGION`, `BUCKET_NAME`, `AWS_SNS_SENDER_ID` | S3 audio, SNS OTP |
| `SMTP_USER`, `SMTP_PASS` | Emails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID` | Billing |
| `AGENT_SERVICE_URL`, `AGENT_SECRET` | Agent-service (JWT signing key) |
| `AGENT_SEND_LEGACY_SECRET` | `false` after migration (phase 2) |
| `JSEARCH_API_KEY`, `NEXT_PUBLIC_HAS_JSEARCH` | Job search |
| `CRON_SECRET` | Cron routes |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | Tracing (optional) |

**agent-service (Railway):**

| Var | Use |
|---|---|
| `AGENT_SECRET` | Same as Next.js (JWT verify) |
| `AGENT_ALLOW_LEGACY_SECRET` | `false` after migration (phase 2) |
| `DATABASE_URL` | Same Postgres → `agent_memory` schema (memory + jobs). **Missing = in-memory (restart par data loss)** |
| `OPENAI_API_KEY`, `GROQ_API_KEY` | LLMs |
| `PINECONE_API_KEY`, `PINECONE_INDEX` | FAQ docs (Next.js wala same project!) |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Optional (read-only); bina token anonymous API (60/hr) |
| `JSEARCH_API_KEY`, `BRAVE_SEARCH_API_KEY` | Auto-apply job search |
| `GOOGLE_CALENDAR_MCP_COMMAND/ARGS/TOOL_NAME` | Optional calendar MCP |
| `LANGFUSE_*`, `LANGFUSE_CAPTURE_CONTENT` (dev only), `APP_ENV` | Tracing |
| Tuning | `GROQ_MAX_RPS` (0.5), `OPENAI_MAX_RPS` (0), `AGENT_USER_RPM` (30), `AGENT_USER_BURST` (10), `AGENT_JOB_WORKERS` (2), `AGENT_JOB_TIMEOUT_S` (600), `SCREENING_SHORTLIST_AT` (75), `SCREENING_REJECT_BELOW` (50), `LOG_LEVEL` |

### 10.3 Next.js → AWS Amplify (`amplify.yml`)
1. `git push master` → Amplify build trigger
2. **preBuild:** `npm install` → `npx prisma generate`
3. **build:** `npm run build` (prebuild copies Monaco assets; `next build` compile + type-check)
4. **postBuild:** `npx prisma migrate deploy` (pending migrations apply)
5. Artifacts `.next` → Amplify SSR compute; env vars Amplify console mein

### 10.4 agent-service → Railway (`railway.toml`, `Procfile`, `runtime.txt`)
1. Push → Nixpacks build (Python 3.11.9, `requirements.txt`)
2. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Health check `/health` (30s), restart on failure
4. Startup (lifespan): `agent_memory` schema + checkpoint tables + `agent_jobs` table, job workers, LLM client warm-up
5. Shutdown: workers stop → Langfuse flush → DB pool close → MCP servers stop

### 10.5 Release checklist
1. Deploy **agent-service pehle**, phir Next.js (dono order safe hain migration phase mein — Next token + legacy header dono bhejta hai)
2. `/health` → `memory: postgres` confirm
3. Smoke: Copilot ek turn (job progress dikhe), screening, panel
4. Auth phase 2: Amplify `AGENT_SEND_LEGACY_SECRET=false`, Railway `AGENT_ALLOW_LEGACY_SECRET=false`
5. Stripe webhook endpoint `/api/billing/webhook` configured
6. Crons (`/api/cron/reminder`, `/weekly-digest`, `/ping-agent`) — external scheduler (e.g. cron-job.org) `CRON_SECRET` ke saath

### 10.6 Scaling path
| Load badhe to | Kya karo |
|---|---|
| Agent jobs | `AGENT_JOB_WORKERS` badhao ya alag worker service (same table/code) |
| Multiple agent replicas | Already safe (SKIP LOCKED, Postgres checkpoints); rate limiters per-process → Redis-based global limiter |
| LLM limits | Provider paid tiers + `*_MAX_RPS`; cheaper `fast` tier models via env |
| DB | Connection pooling (PgBouncer), job/thread retention cleanup, read replicas for analytics |

---

## 11. Deep-dive Q&A (interview prep)

**Q1. Architecture ek line mein?**
Next.js (Amplify) UI + CRUD + saare side effects; Python FastAPI + LangGraph (Railway) multi-step agents; dono same Postgres (alag schemas); per-user JWT; lambi runs durable job queue se.

**Q2. AI agent kya hai? ReAct use kiya?**
Agent = LLM + tools + loop. Is project mein mostly **controlled workflows** (LangGraph graphs) + LLM nodes, kyunki hiring actions sensitive hain — predictable flow chahiye. ReAct-style loop: resume improvement (rewrite → score → decide). Copilot mein LLM sirf **plan** banata hai; execution deterministic supervisor.

**Q3. LangGraph kyun, LangChain/CrewAI kyun nahi?**
Branching, loops, typed state, **checkpointing + `interrupt()`** (HITL), sub-graphs — LangGraph native. LangChain sirf model wrappers. CrewAI role-play prototype ke liye theek, lekin consensus formula, approval gates aur deterministic control mujhe khud chahiye tha.

**Q4. Supervisor pattern kaise implement kiya?**
Planner (1 LLM call) → ≤3 steps `[{intent, condition}]` → code se sanitize (dedupe, `if_shortlisted` sirf screening ke baad, cap 3) → supervisor node har worker ke baad agla step chunta hai, condition **actual result** se check karta hai. Har pass index badhata hai → loop always terminates.

**Q5. Multi-agent state management?**
Typed state per graph; har agent alag key likhta hai; shared lists par reducers (`operator.add`, `add_messages`); sub-agents ko explicit input, wapas sirf report; per-turn fields reset; sub-graphs `checkpointer=False`.

**Q6. Parallel agents?**
Panel: `START` se 3 edges (fan-out), list edge se consensus (fan-in). Alag keys + reducer → koi write conflict nahi. Test 0.3s delay wale fake LLM se — sequential version par fail hota hai.

**Q7. Tool calling / MCP?**
Custom stdio JSON-RPC MCP client + **pool** (cold 4.5s → warm 0.1s). Tool registry: risk, allowed agents, timeout, circuit breaker, Langfuse span. Probe mein mila tha: purana code `list_repositories_by_user` call karta tha jo server mein tha hi nahi — fix: `search_repositories` + allowlist (write tools blocked).

**Q8. Infinite loop kaise roka?**
Resume loop: score ≥ 70 ya max 3 (counter state mein, LLM ke haath mein nahi). Supervisor: monotonic index, plan ≤ 3. LangGraph recursion limit. Timeouts: LLM 60s, tools per-tool, jobs 600s.

**Q9. Human-in-the-loop kab aur kaise?**
Jab action irreversible/insaan par asar/external ho: AI reject, slot booking + email. `interrupt()` → Postgres checkpoint → recruiter answer → `Command(resume=…)`. Resume par node re-run hota hai, isliye side effects graph ke bahar. Pending approval par naya message 409 (warna LangGraph silently discard karta). `human_override` score Langfuse mein — AI quality signal.

**Q10. Memory — short / long / episodic?**
Short-term: graph state. Thread memory: Postgres checkpointer (multi-turn, restart-safe). Long-term knowledge: Pinecone (resumes, policy docs) + Postgres records. Episodic (past runs ko recall karna): abhi nahi — next step (LangGraph Store, user/org namespace).

**Q11. Conflict resolution between agents?**
Panel: weighted score (50/25/25) + majority vote; split → `hold` (human). Disagreement report mein alag dikhta hai. LLM se final decision nahi.

**Q12. Agentic safety — galat action kaise rokte ho?**
Layers: JWT + roles → least-privilege read-only tools → Pydantic validated outputs + allowlists → injection fencing/detection → decision by code → HITL for side effects → atomic DB writes → evals + traces. Principle: **LLM propose karta hai, code execute karta hai**.

**Q13. Orchestrator vs executor?**
Orchestrator (planner + supervisor + finalize) kya karna hai decide karta hai, results combine karta hai; executors (screening, scheduler, faq) apna kaam tools ke saath karte hain, standalone bhi callable.

**Q14. Prompt injection ka real risk aur defence?**
Candidate wahi text likhta hai jise AI judge karta hai. Defence: `<resume>` fence + note, tag break-out neutralise, hidden chars strip, 7 pattern detector → human review, aur decision score se code mein. Eval: 3/3 attacks reject + flagged.

**Q15. Fairness kaise ensure ki?**
Prompt rule, protected-attribute reasons strip, **counterfactual eval** (same resume, sirf protected detail badla). Pehli run: same score par alag decision → decision LLM se hata ke code policy banayi.

**Q16. LLM output reliability?**
Pydantic schemas (range, enums), re-ask with error, `fallback_used` flag → human review; guardrail fail-closed (judge fail → faithfulness 0.0, pehle 0.5 se bypass ho jaata tha).

**Q17. Job queue Redis/Celery ke bina kyun?**
Postgres pehle se tha; `FOR UPDATE SKIP LOCKED` exactly isi ke liye; lease + heartbeat + max attempts; idempotency unique index; usage exactly-once. Verified: 4 workers × 20 jobs → har job ek baar.

**Q18. Observability aur PII?**
Langfuse client-level mask → node tree, tokens, cost, latency dikhte hain, content nahi. Request ID logs/headers/traces mein. Usage callback sub-agents samet count karta hai → `AiUsageLog` per user.

**Q19. 10x load par kya tootega pehle?**
LLM provider rate limits (→ paid tier, `*_MAX_RPS`, queue absorb karti hai), in-process job workers (→ alag worker service), per-process rate limiters (→ Redis), DB connections (→ PgBouncer), job/thread table growth (→ retention job).

**Q20. Production mein kaunse bugs pakde?**
Guardrail bypass (judge fail = 0.5), fake +5 score loop, GitHub verification poori band (wrong MCP tool + invalid token 401), slot double-booking (10/10 parallel requests succeed hote the), nakli job listings tracker mein save, pricing $0 for dated model names, fairness drift (same score, alag decision). Har ek ka test/eval ab hai.

---

## 12. Known limitations & next steps

| Area | Limitation | Next step |
|---|---|---|
| Data retention | Agent jobs + Copilot threads mein resume text indefinitely | 30-day cleanup job |
| Async coverage | Job-match & resume-improve abhi sync HTTP (60–120s) | Job queue + "on completion" DB write hook |
| Copilot UX | Ek current thread; approvals sirf thread ke andar | Threads list + pending-approvals inbox |
| Injection / bias detection | Regex-based | Small classifier / LLM judge as extra layer |
| Concurrency | Same thread par parallel turns ka server-side lock nahi | Per-thread advisory lock |
| Rate limiting | Per process | Redis global limiter |
| Lint | Kuch purane lint errors (e.g. sidebar setState in effect) | Fix + ESLint CI gate |
| Crons | Repo mein scheduler config nahi | External cron confirm ya platform scheduler |
| JD scraping | Playwright ke liye Amplify par Chromium nahi | Verify; warna HTTP-only + dependency hatao |
| Long-term memory | Episodic/preference memory nahi | LangGraph Store (org/user namespace) |
