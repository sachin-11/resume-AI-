# Skill-wise Interview Questions — JD ke 8 skills, har ek apne project se joda hua

> JD ke skills: **Python & FastAPI · Agentic AI & LangGraph · MCP Server/Client · LangSmith · RAG & Vector DB · React.js · AWS · MLOps & CI/CD**
>
> Har skill ke liye 3 cheezein:
> 1. **Kis type ke sawaal aayenge** (concept wale + "tumne kaise kiya" wale)
> 2. **Project mein kahan hai** (file ka naam — interview se pehle ek baar khol ke dekh lo)
> 3. **Jawab** (English mein, bolne layak) + jahan kamzori hai wahan imaandaar line
>
> Numbers aur kahaniyan `INTERVIEW_PREP.md` se hi lo — yahan koi naya number nahi banaya.
> **Golden rule:** pehle concept ek line mein, phir "in my project…" — interviewer ko dono chahiye.

---

## Pehle samajh lo — interviewer kaise sochta hai

Har skill pe sawaal 3 level mein aate hain:

| Level | Example | Tumhe kya dikhana hai |
|---|---|---|
| **1. Definition** | "What is RAG?" | Simple, ek line, bina ratta |
| **2. Tumne kaise kiya** | "How did you chunk documents?" | File, decision, number |
| **3. Trade-off / failure** | "What if retrieval returns wrong chunks?" | Kya toota, kya seekha, kya alag karoge |

Level 3 pe hi selection hota hai. Isliye har section mein "failure / trade-off" wale sawaal zaroor padhna.

---

## 1. Python & FastAPI

**Project mein kahan:** `agent-service/main.py` (saare endpoints), `core/auth.py` (JWT), `core/jobs.py` (background jobs), `core/ratelimit.py`, `tests/` (178 tests, pytest)

### Concept wale sawaal

**Q: FastAPI kyun? Flask/Django kyun nahi?**
> "FastAPI is async-first, which matters because almost everything my agent service does is I/O — LLM calls, Postgres, Pinecone, MCP servers. It also gives me request validation from Pydantic models and auto-generated OpenAPI docs for free. Django would bring an ORM and admin I didn't need — the database schema is owned by the Next.js side with Prisma."

**Q: `async def` vs `def` endpoint mein kya farak hai?**
> "An `async def` endpoint runs on the event loop, so it must not block — any blocking call freezes every other request. A plain `def` endpoint runs in a threadpool. In my service the LLM, DB and MCP calls are all async, so endpoints are `async def`. A few small admin reads that do nothing heavy are plain `def`."
>
> **Trap:** `async def` ke andar `time.sleep()` ya `requests.get()` — poora server ruk jaata hai. Ye bolna aata ho.

**Q: Dependency Injection (`Depends`) kya hai, kahan use kiya?**
> "Depends lets an endpoint declare what it needs and FastAPI resolves it per request. I use it for auth: `get_caller` verifies the JWT and returns a `Caller` (user, org, role); `require_admin` builds on it and checks the role; `limited_caller` adds rate limiting on top. So every endpoint gets auth just by its signature, and the user id always comes from the verified token — never from the request body."

**Q: Pydantic se kya milta hai?**
> "Request/response validation, and in my case also LLM output validation. Every structured LLM reply is parsed into a Pydantic model; if it fails, the model gets the validation error back once, and after that we fall back with a `fallback_used` flag instead of showing a fake score."

**Q: Middleware, lifespan kya hai?**
> "Lifespan is startup/shutdown. On startup I open the Postgres checkpointer and compile the Copilot graph with it, pre-build the LLM clients (their first import blocks for seconds and would stall the event loop on the first request), and start the background job workers. On shutdown I stop the workers before the pool closes, flush buffered Langfuse traces and close the MCP sessions. I have an HTTP middleware that assigns a request id to every request, so logs, Langfuse traces and the audit log can be joined on one id."

### "Tumne kaise kiya" wale sawaal

**Q: Lamba chalne wala kaam (60 second ka agent run) HTTP request mein kaise?**
> "I don't hold the request open. A screening or panel run takes 20–90s, and a serverless Next.js function can time out and lose the result. So the caller submits a job, gets `202` and a `job_id` immediately, and polls. Jobs live in a Postgres table; workers claim them with `SELECT … FOR UPDATE SKIP LOCKED`, so two workers never run the same job. A claimed job has a lease the worker keeps extending — if the worker dies, the lease expires and another worker retries it, up to a max attempts. There's also an idempotency key so a double-click doesn't create two jobs."
>
> (`core/jobs.py` — ye bahut strong jawab hai, zaroor bolna.)

**Q: Testing kaise karte ho jab LLM beech mein hai?**
> "Two layers. 178 unit tests with a fake LLM — deterministic, no API keys, free, on every push. And separate real-LLM eval suites that run only when prompts, models or tools change, and weekly."

### Trade-off / failure

**Q: Windows pe kya dikkat aayi?** (agar async ka deep sawaal ho)
> "psycopg's async driver doesn't work on Windows' ProactorEventLoop, which the MCP stdio client needs locally. So locally memory falls back to an in-memory checkpointer; production on Linux uses Postgres. It's documented in `core/memory.py`."

**Q: GIL ke baare mein?**
> "The GIL stops two threads running Python bytecode at the same time, so threads don't speed up CPU-bound work. My service is I/O-bound, so async is the right tool. CPU-heavy work like running candidate code doesn't run in my process at all — it goes to the AgentCore sandbox."

---

## 2. Agentic AI & LangGraph

**Project mein kahan:** `agent-service/agents/` (13 agents), `agents/orchestrator/graph.py` (supervisor + human gates), `agents/bulk_screening/graph.py` + `agents/hiring_committee/graph.py` (`Send` fan-out), `agents/faq/` (ReAct), `core/memory.py` (checkpointer), `core/guards.py`

### Concept wale sawaal

**Q: Agent aur normal LLM call mein kya farak hai?**
> "A normal call is one prompt, one answer. An agent runs a loop — the model decides the next step, calls a tool, sees the result, and decides again — until it's done. The power is that the path isn't hard-coded; the risk is the same thing. So in my project I use free agent loops only where the next step genuinely isn't known, and fixed graphs where I need auditability."

**Q: LangGraph kyun? Plain LangChain ya khud ka loop kyun nahi?**
> "Three things I'd otherwise have to build myself: explicit state passed between nodes, a checkpointer that persists that state after every step, and `interrupt()` for human-in-the-loop. Together they mean an agent can pause for a recruiter's approval, the server can restart, and the run continues from exactly the same step."

**Q: State, Node, Edge, Conditional edge samjhao.**
> "State is a typed dict every node reads and returns updates to. A node is a function — an LLM call, a tool call or pure code. Edges connect nodes; a conditional edge is a function that looks at the state and returns which node is next. In my orchestrator, `route_next` reads the supervisor's decision and routes to the right worker agent or to the end."

**Q: ReAct kya hai? Kahan use kiya?**
> "Reason + Act: the model thinks, picks a tool, observes the result, repeats. My FAQ agent was single-shot retrieval — one search, then answer — and scored 40% on the eval set. Questions worded differently from the docs failed. As ReAct it can re-search with different words, and it went to 100% on that set. Small set, so I treat it as a regression gate."

**Q: Multi-agent patterns — supervisor vs others?**
> "I use two. First, planner + supervisor in the Recruitment Copilot: one LLM call turns the message into a plan of up to 3 steps — e.g. screening, then scheduling *if shortlisted*. The supervisor that walks that plan is plain code, not an LLM: it routes to each worker in turn and checks conditions against actual results, so the loop always ends within the plan's length. Second, map-reduce fan-out with LangGraph's `Send`: bulk screening sends each resume to its own `screen_resume` branch in parallel, the hiring committee does the same per candidate, and a reduce node ranks them — by rules, not an LLM. Parallelism is capped with `max_concurrency` (8 by default)."
>
> (Poori detail: neeche section "Deep dive — Supervisor aur Send fan-out".)

### "Tumne kaise kiya" wale sawaal

**Q: Human-in-the-loop kaise banaya?**
> "If an agent proposes an action that affects a person — reject or book an interview — the graph calls `interrupt()`. The state is saved by the Postgres checkpointer, and the API returns a pending approval. When the recruiter clicks approve, `/threads/{id}/resume` continues the graph with their decision. Because the checkpoint is in Postgres, this survives a restart."

**Q: Memory kaise handle ki?**
> "Short-term memory is the LangGraph checkpointer per thread, in its own `agent_memory` schema in Postgres so Prisma migrations don't see it as drift. Threads are namespaced by user, so a guessed thread id can't reach someone else's conversation."

**Q: Agent loop mein phans jaaye ya bahut paisa kharch kare?**
> "Every run goes through one entry point, `run_agent`, which applies: a recursion limit, a wall-clock timeout, a token and dollar budget checked before each LLM call, and a circuit breaker — five failures in a row turns that agent off for 60 seconds. Plus an admin kill switch to set an agent to `off` or `read_only` without a deploy."

### Trade-off / failure

**Q: LLM ko hi decide kyun nahi karne diya (shortlist/reject)?**
> "Early evals showed the same score getting 'reject' for one candidate and 'maybe' for a variant that differed only by gender or age. So the LLM gives a score with reasons, and code applies the threshold — shortlist ≥75, reject <50. Deterministic, auditable, and humans approve rejections."

**Q: Agentic system ki sabse badi problem kya lagi?**
> "Non-determinism. The same input can take a different path. That's why I run every eval case 3 times, take the mean and list flaky cases — a single run once looked like bias, and averaging showed it was noise." (Kahani B — anchoring on `72` — yahan sunao.)

---

## 3. MCP Server/Client Development

**Project mein kahan:** Server: `app/api/mcp/`, `app/api/oauth/`, `lib/oauth/` (Next.js). Client: `agent-service/core/mcp_pool.py`, `mcp_pins.json`. Detail: `MCP.md` aur `INTERVIEW_PREP.md` section 6.5 (wahan poori kahani aur counter questions hain — **wahi padho**).

> Ye tumhara sabse strong section hai kyunki tumne **dono** banaye — server bhi, client bhi. Ye pehle hi bol do.

### Concept wale sawaal

**Q: MCP kya hai, ek line mein?**
> "A standard protocol so any AI app can use any tool server — like USB-C for AI tools. A server exposes tools, resources and prompts; a client (Claude Desktop, or my own agent service) discovers and calls them."

**Q: Tools, Resources, Prompts mein farak?**
> "Tools are actions the model can call — they can change things. Resources are read-only data the app can attach as context. Prompts are reusable templates the user picks. Who controls it: tools — the model; resources — the app; prompts — the user."

**Q: Transports kaun se hain?**
> "stdio for local servers started as a subprocess, and Streamable HTTP for remote servers. My server is remote over Streamable HTTP. My client supports both."

**Q: Function calling aur MCP mein farak?**
> "Function calling is how one model calls functions you define inside your app. MCP is the layer above — a standard way to package those tools in a separate server so any client can discover and use them without custom integration code."

### "Tumne kaise kiya" wale sawaal

**Q: Server side kya banaya?**
> "The platform itself is an MCP server with its own OAuth 2.1 authorization server, live in production — a recruiter connects Claude Desktop, logs in, approves scopes, and can work with their candidates. Discovery metadata, dynamic client registration, PKCE, consent, refresh token rotation, revocation. Write actions need a confirmation through an approval link." (Numbers aur 4 production bugs ki kahani: INTERVIEW_PREP 6.5.)

**Q: Client side kya banaya?**
> "My Python agent service is an MCP client using the official SDK. One long-lived session per server in a background task, with a queue; a dead or hung session is dropped and restarted on the next call. stdio servers are started from an exact package version — never `npx -y latest` — because that's a supply-chain risk."

**Q: MCP ki security kaise ki?**
> "On the client: each server has an allowlist of tools, because servers expose far more than you need — GitHub's can push code. And tool pinning: I hash every tool's definition — name, description, schema. If a server silently changes a description, that's a 'rug pull' or tool-poisoning attack, so the tool is refused and an alert fires until someone reviews and re-pins. On the server: OAuth scopes, per-org isolation, and confirmation for writes."

**Q: Tracing across MCP?**
> "Every call carries W3C trace context in `_meta.traceparent`, so the client log and the server's audit line share one trace id."

### Trade-off / failure

**Q: Kya galat hua?**
> "Claude didn't call my tool at all in one test — because tool descriptions are effectively prompts. Rewriting the description fixed it, and I now have an eval for tool selection (`evals/mcp_tools.json`)." (Kahani 3, INTERVIEW_PREP 6.5.)

---

## 4. LangSmith

> ⚠️ **Imaandaar baat pehle:** project mein **LangSmith nahi, Langfuse** use kiya hai. Dono same kaam karte hain (LLM tracing + evals + prompt management). **Kabhi mat bolna ki LangSmith use kiya.** Seedha bolo aur concept pe strong raho — interviewer ko yahi chahiye.

**Opening line (yaad kar lo):**
> "I used Langfuse rather than LangSmith — same category: tracing, cost, evals. I chose it because it's open-source and self-hostable, which mattered for candidate PII. The concepts map one-to-one, and since my agents are LangGraph, switching to LangSmith is mostly setting environment variables."

**Project mein kahan:** `agent-service/core/observability.py`, `lib/langfuse.ts`, `evals/`

### Kya poochenge

**Q: LangSmith kya karta hai?**
> "Observability for LLM apps: every run becomes a trace — a tree of spans for each chain, LLM call and tool call, with inputs, outputs, latency, tokens and cost. On top of that: datasets and evaluators to test prompts, prompt versioning, and monitoring dashboards."

**Q: Trace aur span mein farak?**
> "A trace is one full request — one agent run. Spans are the steps inside it — each node, each LLM call, each tool call — nested as a tree."

**Q: LangGraph app mein tracing kaise on karte?**
> "With LangSmith: set `LANGSMITH_TRACING=true` and the API key — LangChain/LangGraph trace automatically. In my project I pass a Langfuse callback handler into the graph's config, which does the same thing."

**Q: Production tracing mein PII ka kya?** (yahan tum strong ho)
> "Traces are sent to a third party, and my prompts contain resumes. So my Langfuse client is built with a mask that replaces every string in inputs and outputs with a length placeholder. I keep the node tree, timings, models and token counts — but no content. Full content capture is only enabled for synthetic data. LangSmith has a similar option to hide inputs and outputs."

**Q: Evals kaise karte ho? (LangSmith datasets/evaluators ka sawaal)**
> "Concept is the same as LangSmith datasets: labelled cases, an evaluator, a score, compared against a baseline. Mine is a custom harness in `evals/run_evals.py` — 7 suites, 17 metrics, every case 3 times, and CI fails if a metric drops more than 0.05 from the committed baseline. I also turn 👎 feedback into new eval cases (`harvest_feedback.py`)."

**Q: LLM-as-a-judge?**
> "Useful for things code can't check, like whether an FAQ answer is faithful to the docs. The weakness is that the judge itself can be wrong — I haven't validated mine against human labels yet, and that's on my list."

**Q: Ek slow/galat agent run ko debug kaise karoge?**
> "Open the trace by request id, look at which span took the time or produced the wrong output — was it retrieval, the LLM, or a tool — then reproduce that input as an eval case so it can't come back."

---

## 5. RAG & Vector Databases

**Project mein kahan:** `lib/rag.ts` (resume RAG, TypeScript), `agent-service/agents/faq/store.py` + `faq/nodes.py` (company policy docs RAG, Python), `releases.json` ka `kb` section (chunking config pinned)

### Concept wale sawaal

**Q: RAG kya hai, kyun chahiye?**
> "Retrieve relevant text from your own data, put it in the prompt, then generate. The model doesn't know my user's resume or the company's policies, and fine-tuning for per-user data makes no sense. RAG gives grounded answers that can cite their source and update the moment the data changes."

**Q: Pipeline batao.**
> "Indexing: document → chunks → embeddings → vector DB with metadata. Query time: embed the question → similarity search → top-k chunks → prompt → answer. In my project: OpenAI `text-embedding-3-small` (1536 dims), Pinecone, and a Groq/OpenAI model for generation."

**Q: Chunking kaise kiya? Size kaise decide kiya?**
> "500-word chunks with 100-word overlap, so a sentence cut at a boundary still appears whole in one chunk. Too small loses context, too big dilutes the match and costs tokens. The chunking and embedding model are pinned per environment in `releases.json`, because changing them means re-ingesting everything."
>
> **Imaandaar add-on:** "It's fixed-size by words; section-aware chunking — by resume section or policy heading — would be my next improvement."

**Q: Cosine similarity kya hai?**
> "The angle between two vectors — 1 means same direction, same meaning. Vectors are normalised, so it's basically a dot product."

**Q: Vector DB kyun? Postgres mein kyun nahi?**
> "Pinecone gave me managed approximate nearest neighbour search and metadata filtering with no ops. At my scale `pgvector` in the Postgres I already have would work fine too, and honestly I'd consider it to drop one service. The trade-off is ops and scale vs. one less dependency."

### "Tumne kaise kiya" wale sawaal (yahan tumhare paas achhe points hain)

**Q: Multi-tenant data — ek user ka resume doosre ko na dikhe?**
> "Every vector carries metadata `userId`, and every query filters on it with `$eq`. Company policy docs share the same index but are tagged `type: policy_doc`, so they never mix with resume chunks."

**Q: Retrieval quality kaise improve ki?**
> "Two things. I over-fetch — ask Pinecone for 3× top-k — drop anything below a 0.3 similarity, then rerank by blending the vector score (70%) with keyword overlap (30%). Pure vector search can rank a chunk high on general closeness while missing the exact skill or tool name the query asked for. It's cheap — no extra model call. Second, for FAQ, ReAct lets the agent re-search with different words — that's what took it from 40% to 100% on the eval set."

**Q: Koi bug jo tumne pakda?** (strong kahani)
> "Embedding-space mixing. If OpenAI's embedding call failed, the code silently fell back to a hash-based pseudo-embedding with the same dimension. So a resume could have some chunks in one vector space and some in another — and similarity between them is meaningless, with no error anywhere. Fix: a failed call now throws instead of switching, every vector is tagged with which provider produced it, and retrieval filters on that tag."

**Q: Document na mile to?**
> "The FAQ agent answers with an explicit no-context fallback and logs it, instead of inventing a policy. There's a test case for a question the docs don't cover."

### Trade-off / failure

**Q: Hallucination kaise kam karte ho?**
> "Answer only from retrieved chunks, a similarity threshold so weak matches don't get in, an explicit 'not covered' path, and a faithfulness eval. I can't say it's zero — that's why it's measured."

**Q: Hybrid search / reranker?**
> "My reranking is a lightweight version of hybrid search — vector plus lexical. A proper next step would be BM25 + vector with a cross-encoder reranker, but I'd only add it if the eval showed retrieval as the bottleneck."

---

## 6. React.js

**Project mein kahan:** `app/` (Next.js 16 App Router, React 19), `hooks/` (`use-audio-recorder.ts`, `use-camera.ts`, `use-proctoring.ts`, `use-speech.ts`), `components/`, `app/(dashboard)/recruiter-copilot/approval-card.tsx`, Recharts dashboards

> Note: tumhara frontend **Next.js** hai — jo React hi hai. Bolo: "React through Next.js App Router." Agar pure React (Vite/CRA) pooche to concepts same hain.

### Concept wale sawaal

**Q: Virtual DOM / reconciliation?**
> "React keeps a lightweight tree of what the UI should look like; on a state change it builds a new tree, diffs it with the old one, and applies only the differences to the real DOM. Keys tell it which list items are the same across renders."

**Q: `useEffect` kab chalta hai? Cleanup kyun?**
> "After render, whenever its dependencies change. The cleanup runs before the next effect and on unmount. In my proctoring and camera hooks this really matters — the cleanup stops the media stream tracks, otherwise the camera light stays on after the user leaves the interview page."

**Q: Custom hook kya hai, kaunse banaye?**
> "A function starting with `use` that bundles stateful logic so components stay simple. I wrote `useCamera`, `useAudioRecorder`, `useSpeech` and `useProctoring` for the AI interview — each wraps a browser API, its state and its cleanup."

**Q: `useMemo` / `useCallback` / `React.memo`?**
> "Memoise an expensive value, a function's identity, or a component's render. I use them only when there's a measured problem — they have their own cost."

**Q: Server Components vs Client Components?** (Next.js wala — zaroor aayega)
> "Server Components render on the server, can read the database directly, and send no JS to the browser. Client Components (`'use client'`) are needed for state, effects and browser APIs. My dashboard pages fetch on the server; the camera, recorder and Monaco code editor are client components."

**Q: State management — Redux use kiya?**
> "No. Server state comes from server components and API routes; local UI state is `useState`; auth session is context from NextAuth. I didn't have enough shared client state to justify Redux."

### "Tumne kaise kiya" wale sawaal

**Q: 60 second ka agent run UI mein kaise dikhaya?**
> "The API returns a job id and the UI polls the job status, which includes node-by-node progress — so the user sees 'screening… scoring… done' instead of a spinner."

**Q: Human approval UI?**
> "When the Copilot pauses on an `interrupt`, the UI renders an approval card with what the agent wants to do and why; approve or reject calls the resume-thread endpoint."

**Q: Error handling?**
> "An error boundary component so one broken widget doesn't blank the whole page, and if an agent used its fallback, the UI says 'unavailable' rather than showing a fake score."

### Imaandaar line
> "My strength is the backend and AI side; the frontend is solid but not where I'd claim deep expertise like performance profiling at scale."

---

## 7. AWS

**Project mein kahan:**
- **Amplify** — Next.js hosting (`amplify.yml`)
- **S3** — interview audio upload + presigned URLs (`lib/s3.ts`)
- **SNS** — OTP SMS (`lib/sns.ts`)
- **Transcribe** — speech to text (`lib/transcribe.ts`)
- **Bedrock AgentCore Code Interpreter** — candidate code sandbox (`agents/code_assessment/sandbox.py`, `infra/agentcore-code-interpreter-policy.json`)
- **IAM** — least-privilege users

> Note: Python agent service Render pe hai, AWS pe nahi. Poochein to sach bolo, aur "dobara karoon to sab ek cloud pe" wali line (INTERVIEW_PREP section 6) yahan kaam aati hai.

### Kya poochenge

**Q: Kaun si AWS services use ki aur kyun?**
> "Amplify for the Next.js app with migrations in the build; S3 for interview audio; SNS for OTP SMS; Transcribe for speech-to-text; and Bedrock AgentCore Code Interpreter as a sandbox to run untrusted candidate code. IAM with a separate least-privilege user per purpose."

**Q: Presigned URL kya hai, kyun?**
> "A time-limited URL signed with my credentials that lets someone read or upload one specific object without having AWS credentials. The bucket stays private, audio is only reachable through a link that expires — default 1 hour in my code."

**Q: IAM least privilege kaise kiya?**
> "A dedicated IAM user for the sandbox with only the three Code Interpreter actions it needs, and a separate one for CI. If a key leaks, the worst case is someone starts sandboxes — not reading S3 or sending SMS. The policy is in the repo."

**Q: AgentCore kyun, Lambda ya Docker kyun nahi?**
> "Candidate code is untrusted. AgentCore gives a managed microVM with no network and a timeout, a fresh session per candidate. Running my own Docker fleet means I own the isolation and patching; Lambda isn't designed as a sandbox for arbitrary user code. I only used the Code Interpreter piece — not AgentCore Memory or Observability, because I already had Postgres checkpointing and Langfuse."

**Q: Bedrock aur OpenAI mein kya choose karoge?**
> "Bedrock keeps data in my AWS account and region, has IAM-based access and gives several model providers behind one API — good for enterprise compliance. I used OpenAI with a Groq fallback for cost and speed; my LLM gateway is one file, so adding Bedrock as a provider is straightforward."

**Q: Production pe scale karna ho to AWS pe kaise karoge?** (design sawaal)
> "Agent service as a container on ECS Fargate behind an ALB with autoscaling; RDS Postgres; jobs stay in Postgres with `SKIP LOCKED` or move to SQS if volume grows; secrets in Secrets Manager; CloudWatch for logs and alarms. Whatever I pick, the agents don't change — they're stateless and all state is in Postgres."
>
> (Ye design hai, kiya nahi hai — bolte waqt "I would" use karo, "I did" nahi.)

---

## 8. MLOps & CI/CD

**Project mein kahan:** `.github/workflows/agent-quality.yml`, `agent-service/evals/` (baseline.json, regressions.jsonl), `releases.json` + `core/release.py` (pinning, canary, rollback), `core/flags.py` (kill switch), `core/metrics.py`

> ⚠️ **Imaandaar baat:** tumne koi model **train ya fine-tune nahi** kiya. Tumhara kaam **LLMOps** hai — prompts, models aur KB ko version karna, test karna, safely release karna. Ye seedha bolo — aaj kal ye hi zyada demand mein hai.

**Opening line:**
> "I haven't trained models — my MLOps work is LLMOps: treating prompts, model versions and knowledge-base config as releasable artifacts, with evals as the quality gate, canary releases and one-command rollback."

### CI/CD wale sawaal

**Q: CI pipeline mein kya hai?**
> "GitHub Actions, four jobs: Python unit tests with a fake LLM; TypeScript type-check of the web app; an MCP end-to-end job against a real Postgres service container and a real Next.js server — the full OAuth flow through the official MCP client; and real-LLM evals that run when prompts, models or tools change, plus weekly on a schedule to catch provider drift."

**Q: CD kaise hota hai?**
> "Next.js deploys on Amplify on push, and runs `prisma migrate deploy` after build. The agent service deploys on Render. And I learned to add a post-deploy check — once auto-deploy was off and the agent service was 25 commits behind the frontend, which only a smoke test caught." (Kahani C.)

**Q: Evals CI mein kaise gate karte hain?**
> "Each suite produces metrics; they're compared with a committed `baseline.json`. A drop of more than 0.05 fails the PR. Each case runs 3 times because LLMs are non-deterministic, and flaky cases are listed separately."

### MLOps / LLMOps wale sawaal

**Q: Model versioning kaise?**
> "Models are pinned to dated snapshots, like `gpt-4o-mini-2024-07-18`, never a floating alias — a provider update otherwise changes behaviour under you. Every run records a fingerprint of model + prompt + tools + KB config, so I can tell exactly what produced any output."

**Q: Naya model/prompt production mein kaise laoge? (safe rollout)**
> "Run the evals against it first. Then canary: `releases.json` defines a canary variant and a share of runs gets the new models; I compare error rate, cost and feedback per variant. Rollback is one command, and the kill switch can set an agent off or read-only without a deploy."

**Q: Model drift / data drift?**
> "For LLMs, drift is mostly the provider changing the model or the inputs changing. Pinning handles the first; the weekly scheduled eval run catches regressions anyway; and 👎 feedback is harvested into new eval cases, so real-world failures become tests."

**Q: Monitoring kya karte ho?**
> "Per agent: error rate, p50/p95 latency, tokens and cost, with alerts on error rate, p95 and daily spend; a run-history dashboard; Langfuse traces for drill-down; an audit log of every tool call with argument hashes, not PII."

**Q: Classic MLOps tools — MLflow, feature store, model registry?**
> "I haven't used them in this project because there's no model training. The equivalent ideas are there: `releases.json` is effectively my model and config registry, the eval baseline is my validation gate, and run fingerprints give lineage. If I trained or fine-tuned a model, MLflow for experiment tracking and the registry would be my first pick."

---

## Deep dive — Supervisor aur Send fan-out (LangGraph ke do patterns)

> Ye dono patterns ek hi sawaal ka jawab hain: "multi-agent kaise banaya?" Pehla **sequential** hai (ek ke baad ek, shart ke saath), doosra **parallel** hai (sab ek saath, phir jodo).

### Pattern 1 — Planner + Supervisor (Recruitment Copilot)

**File:** `agents/orchestrator/graph.py`, `nodes.py` (`plan_steps`, `supervisor`), `state.py`

**Problem:** recruiter likhta hai *"is candidate ko screen karo, aur shortlist ho to interview book karo"*. Isme do kaam hain, aur doosra kaam **pehle ke result pe depend** karta hai.

**Graph:**
```
START → planner → supervisor ──► resume_screening → review_rejection ─┐
                     ▲     ├──► scheduling      → approve_booking  ─┤
                     │     ├──► faq ──────────────────────────────── ┤
                     │     └──► other ────────────────────────────── ┤
                     └───────────────── wapas supervisor ◄───────────┘
                  supervisor (plan khatam) → finalize → END
```

**Step by step:**
1. **Planner (sirf yahi LLM hai):** message ko max 3 steps ke plan mein todta hai:
   `[{intent: "resume_screening", condition: "always"}, {intent: "scheduling", condition: "if_shortlisted"}]`
   Output Pydantic se validate hota hai, aur `normalize_plan` saaf karta hai: duplicate hatana, `if_shortlisted` sirf screening ke baad, max 3. Agar LLM fail ho jaaye to fallback plan `other` hai.
2. **Supervisor (plain Python, LLM nahi):** state mein `step_index` rakhta hai. Har baar agla step uthata hai:
   - condition `always` hai → `next_step = "resume_screening"`
   - condition `if_shortlisted` hai → screening result ka `screeningDecision` dekhta hai. `"shortlist"` nahi hai to step **skip** karta hai aur wajah `skipped_steps` mein likhta hai.
   - plan khatam → `next_step = "finalize"`
3. **Conditional edge:** `route_next` sirf `state["next_step"]` padhta hai aur us worker node pe bhej deta hai.
4. **Worker** (screening, scheduling, …) apna result state mein likhta hai, aur edge use **wapas supervisor** pe le jaata hai. Yahi loop hai.
5. **Human gates:** screening ke baad `review_rejection` aata hai (AI ne reject kiya to recruiter confirm kare), aur scheduling ke baad `approve_booking`. Dono `interrupt()` use karte hain. **Mazedaar baat:** recruiter AI ka reject palat ke shortlist kar de, to supervisor ko updated decision dikhta hai aur booking wala step chal jaata hai.
6. **Finalize:** saare executed steps ko ek reply mein jodta hai, guardrail check karta hai, aur skipped steps ki wajah bhi batata hai.

**Supervisor ko LLM kyun nahi banaya? (interviewer ye zaroor poochega)**
> "The LLM decides *what* to do once — the plan. Whether a conditional step runs is decided from actual results, by code. Three reasons: (1) it can't loop forever — every pass advances `step_index`, so it ends within `len(plan)` steps; (2) it's deterministic and auditable — 'scheduling skipped: candidate was not shortlisted' is a fact, not a model's opinion; (3) it's one LLM call per turn instead of one per hop — cheaper and faster."

**Counter: "To ye asli supervisor agent hai ya bas if-else?"**
> "It's a deliberate hybrid. The classic LLM supervisor re-decides after every worker, which is flexible but can loop or skip steps unpredictably. My workflows are short and well-defined, so I put the intelligence in planning and kept execution deterministic. If tasks became open-ended — like research — I'd make the supervisor an LLM, but with the same step limit."

### Pattern 2 — Map-reduce with `Send` (Bulk screening, Hiring committee)

**Files:** `agents/bulk_screening/graph.py`, `agents/hiring_committee/graph.py`, `main.py` (`max_concurrency`)

**Problem:** 50 resumes ya 100 candidates — har ek ka kaam **alag aur independent** hai. Ek-ek karke karo to 50 × ~5s = minutes lagenge.

**Graph:**
```
            ┌─► screen_resume (resume 1) ─┐
START ─Send─┼─► screen_resume (resume 2) ─┼─► collect / rank_candidates → END
            └─► screen_resume (resume N) ─┘
```

**Kaise kaam karta hai:**
1. **`fan_out` function** (`START` se conditional edge) har resume ke liye ek `Send("screen_resume", {...})` return karta hai. **Kitni branches banengi, ye runtime pe data se tay hota hai.** Normal edges ke saath ye nahi ho sakta, kyunki unme graph pehle se fixed hota hai.
2. **Har branch ko apna chhota input milta hai**, poori state nahi: sirf woh ek resume + JD. Isliye branches ek doosre ka data nahi chhoo sakti.
3. **Results jodna (reducer):** state mein `results: Annotated[List[dict], operator.add]` hai. Har branch `{"results": [ek_result]}` return karti hai, aur LangGraph sabko **append** karta hai. Reducer na ho to parallel branches ek doosre ko overwrite kar dengi. **Ye sabse common bug hai, isliye bolna zaroor.**
4. **Reduce node** (`collect` / `rank_candidates`) tabhi chalta hai jab **saari branches khatam** ho jaayein. Ye rank karta hai, aur **rules se karta hai, LLM se nahi**: composite score, tie-break pe technical score, phir id. Isliye dobara chalao to same order aata hai. Jinme review reasons hain (injection, AI fallback), woh alag `needsReview` list mein jaate hain.
5. **Edge cases:** resumes khali ho to seedha `collect` pe jaata hai. Results `id` se dedupe hote hain, isliye order ka farak nahi padta.

**Concurrency cap kyun? (zaroor poochenge)**
> "`Send` with 100 candidates would mean 100 simultaneous LLM calls — I'd hit provider rate limits and blow the budget in seconds. So the run config sets `max_concurrency` — 8 by default, from `COMMITTEE_MAX_CONCURRENCY` — and LangGraph runs at most 8 branches at a time. My LLM gateway also has a per-provider rate limiter, so bursts queue locally."

**Counter: "Ek branch fail ho jaaye to?"**
> "Each screening step has its own fallback — if the LLM fails, that resume gets a default score marked `aiFallback`, and `review_reasons` sends it to the needs-review list instead of ranking it as if it were a real judgement. So one bad resume doesn't kill the batch, and it doesn't get silently ranked either."

**Counter: "Bulk screening ne single screening ka graph reuse kyun nahi kiya (subgraph)?"**
> "It reuses the same node *functions* — extract, GitHub check, JD match, report — so bulk and single screening share one decision policy and the same guardrails. I call them directly instead of nesting the graph so live progress can count branches, like 'Screening resumes (23)'."

**Counter: "Ranking LLM se kyun nahi?"**
> "Anchoring. The committee once gave a strong and an average candidate both 72, because the prompt's example JSON said 72. Since then the LLM grades each answer, and code computes the composite and the order — consistent, explainable, stable across reruns."

### Dono ka farak — ek table

| | Supervisor (Copilot) | Send map-reduce (Bulk / Committee) |
|---|---|---|
| Kaam ka type | Alag-alag kaam, ek ke baad ek | Ek hi kaam, N baar |
| Dependency | Agla step pichhle result pe depend | Branches independent |
| Branches kitni | Plan se (max 3) | Data se (N resumes) |
| LLM kahan | Sirf planner | Har branch ke andar (scoring) |
| Final decision | Code (condition check) + human gate | Code (ranking rules) |
| Safety | `step_index` se loop ka ant pakka | `max_concurrency` = 8 |

**Ek line mein yaad rakho:** *"Supervisor = sequential with conditions; Send = parallel with a reducer. Both: LLM does the judgement, code does the control flow."*

---

## Bonus — Mixed sawaal (ek sawaal mein 3-4 skills)

**Q: "Screen this candidate and book an interview" — end to end kya hota hai?**
> React chat → Next.js API signs JWT → FastAPI `/orchestrate` (`Depends` auth + rate limit) → LangGraph supervisor → screening worker (LLM score, Pydantic validated, PII masked) → code threshold decides → `interrupt()` before booking, checkpoint in Postgres → UI shows approval card → recruiter approves → `/threads/{id}/resume` → Next.js does the actual booking + email → Langfuse trace + audit log + metrics.
>
> Isko whiteboard pe banane ki practice karo — ye ek jawab 5 skills cover karta hai.

**Q: Agar kal 10,000 users aa jaayein to kya tootega?**
> "Honestly: the free hosting tier first — ~50s cold start and one instance. Then LLM provider rate limits — I have a client-side limiter and fallback to Groq, but I'd need higher limits. Pinecone and Postgres are fine at that level. The design already helps: jobs are claimed with `SKIP LOCKED` so I can add workers, agents are stateless, and there are per-run cost budgets."

---

## Last 10 minute revision — har skill ki ek "hook line"

| Skill | Ek line jo zaroor bolni hai |
|---|---|
| Python & FastAPI | Long runs = 202 + job id, Postgres `SKIP LOCKED` workers with leases |
| LangGraph | `interrupt()` + Postgres checkpointer → approval survives restart |
| Agentic AI | LLM proposes, code decides (≥75 / <50), human approves |
| MCP | Built both: OAuth 2.1 server live + Python client with tool pinning |
| LangSmith | "I used Langfuse — same concepts; PII masked in traces" |
| RAG | userId filter, over-fetch + rerank, embedding-space mixing bug |
| React | Custom hooks for camera/recorder with cleanup; server vs client components |
| AWS | AgentCore sandbox for untrusted code, least-privilege IAM, S3 presigned URLs |
| MLOps & CI/CD | Pinned models, eval baseline gate in CI, canary + one-command rollback |

**Teen cheezein jo kabhi mat bolna:**
1. "I used LangSmith" — Langfuse use kiya hai.
2. "I trained / fine-tuned models" — nahi kiya.
3. "Deployed the whole thing on AWS" — agent service Render pe hai.
