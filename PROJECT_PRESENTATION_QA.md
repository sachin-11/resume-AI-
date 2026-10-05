# AI Resume Coach — Complete System Design + Interview Q&A

---

## Part A: Poora System Design

### A.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                            │
│  Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/ui        │
│  Webcam/Mic (interview) · Monaco Editor (coding rounds) · Recharts   │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js API Routes (app/api/**)                   │
│  Auth (bcrypt + Google OAuth + Phone OTP) · Rate limiting · CSRF     │
└───┬──────────────┬───────────────┬───────────────┬──────────────────┘
    │               │               │               │
    ▼               ▼               ▼               ▼
┌────────┐   ┌──────────────┐  ┌──────────┐  ┌─────────────────────┐
│Postgres │   │  Groq API    │  │ Pinecone │  │  Python FastAPI     │
│(Prisma  │   │ llama-3.3-70b│  │ Vector DB│  │  Microservice        │
│ ORM)    │   │  (primary)   │  │ (RAG for │  │  (LangGraph Agents)  │
│         │   │      │       │  │  resume  │  │  agent-service/      │
│Users,   │   │      ▼       │  │  Q's +   │  │                      │
│Resumes, │   │  OpenAI      │  │  FAQ)    │  │  9 agents + new      │
│Campaigns│   │  gpt-4o-mini │  │          │  │  Orchestrator layer  │
│Interviews│  │  (fallback)  │  │          │  │  (see Part A.4)      │
│Slots,   │   └──────────────┘  └──────────┘  └──────────┬───────────┘
│Billing  │                                              │
└─────────┘                                              ▼
                                              ┌──────────────────────┐
                                              │ External Tool Layer  │
                                              │ (MCP servers)        │
                                              │ - GitHub MCP         │
                                              │ - Brave Search MCP   │
                                              │ - Calendar MCP(opt.) │
                                              └──────────────────────┘

Also: AWS S3 (audio/video recordings, photos) · AWS SNS (OTP SMS) ·
Stripe (billing) · Playwright (headless browser for auto-apply automation)
```

### A.2 Layered Breakdown

| Layer | Tech | Zimmedari |
|---|---|---|
| **Presentation** | Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui, Framer Motion | UI, client-side state, real-time interview UI (webcam/audio) |
| **API layer** | Next.js Route Handlers (`app/api/**`) | Auth, request validation, orchestrating calls to LLM/DB/Python service, webhooks |
| **Data layer** | PostgreSQL + Prisma ORM | Users, Orgs, Resumes, Interviews, Campaigns, InterviewSlot, Billing — relational source of truth |
| **AI layer (fast path)** | Groq (llama-3.3-70b) → OpenAI (gpt-4o-mini) fallback, direct calls from Next.js | Real-time interview Q&A, feedback generation, chat assistant — low-latency needs |
| **AI layer (agentic path)** | Python FastAPI + LangGraph (`agent-service/`) | Multi-step reasoning workflows: resume rewriting loops, candidate screening, auto-apply pipeline, panel interviews, orchestrator |
| **Retrieval layer** | Pinecone (vector DB) | RAG — resume-based interview questions, FAQ answerer over company docs |
| **Tool layer** | MCP (Model Context Protocol) stdio servers | GitHub repo verification, Brave web search for job listings, (optional) Calendar |
| **Automation layer** | Playwright (headless Chromium) | Auto-fills real job application forms (Greenhouse/Lever/Workday/custom) |
| **Storage** | AWS S3 | Interview audio/video recordings, candidate photos |
| **Messaging** | AWS SNS | Phone OTP for 2FA |
| **Payments** | Stripe | Subscriptions (Free/Pro/Enterprise), usage metering |

### A.3 Two-Sided Marketplace Design

App do bilkul alag user types serve karta hai, same codebase se, role-based access control se:

- **Job Seeker (Candidate)**: resume upload → AI feedback → mock interviews → auto-apply → analytics
- **Recruiter/Company**: bulk campaign create → candidate invite → interviews run → screening/comparison → shortlist → webhook to ATS

Roles: `Admin`, `Recruiter`, `Viewer`, `Candidate` — organization-scoped permissions.

### A.4 AI Agent Layer — Sub-Architecture (Python `agent-service/`)

Ye sabse complex part hai — isliye alag se breakdown:

```
                        POST /orchestrate
                              │
                    ┌─────────▼─────────┐
                    │  classify_intent   │  (LLM intent classification)
                    └─────────┬─────────┘
          ┌───────────────────┼───────────────────┬─────────────┐
          ▼                   ▼                    ▼             ▼
  resume_screening       scheduling               faq          other
  (Candidate Screening   (Scheduler Agent:        (FAQ Agent:   (plain LLM
   Agent — GitHub MCP)    Calendar MCP→DB→gen)     Pinecone RAG) fallback)
          └───────────────────┴────────────────────┴─────────────┘
                              │
                    ┌─────────▼─────────┐
                    │     finalize()     │  Guardrail: human-review flag
                    │  (Guardrail+Eval)  │  RAGAS-style faithfulness score
                    └─────────┬─────────┘  Langfuse trace (opt-in)
                              ▼
                         Response

Independent agents (called directly, not via orchestrator):
  Resume Improvement · Interview Evaluator · Auto-Apply · Job Match ·
  Interview Panel (3-persona) · Learning Path · Market Intelligence · Daily Ops
```

Har agent ek **LangGraph StateGraph** hai — TypedDict state, nodes as pure functions, edges (kabhi conditional loops ke saath, jaise Resume Improvement agent jo score<70 tak `rewrite` node pe loop karta hai).

### A.5 Data Flow — Ek Real User Journey (Mock Interview)

```
1. Candidate resume upload → app/api/resume/upload → PDF parse → text extract
                                     │
                                     ▼
2. Text → Pinecone (chunked, embedded) [lib/rag.ts: indexResume()]
                                     │
3. Candidate "Start Interview" → app/api/interview/start
                                     │
4. Question generation: role+roundType → buildRAGContext()
     → Pinecone retrieve (top-5, score>0.3) → rerank (vector+lexical blend)
     → 60% resume-based + 40% general questions → single Groq call
                                     │
5. Candidate answers (voice→STT text, or typed, or Monaco code editor)
                                     │
6. Follow-up question generation (based on previous answer) — same LLM path
                                     │
7. Interview complete → app/api/feedback/generate
     → buildFeedbackRAGContext() (candidate's own answers → top-3 chunks)
     → Groq scores: Overall/Technical/Communication/Confidence + strengths/weak areas
                                     │
8. Proctoring signals (tab-switch, face-detection, noise) logged throughout
                                     │
9. Recording uploaded to S3, transcript saved to Postgres
                                     │
10. Recruiter views result in dashboard, can compare candidates, add notes
```

### A.6 Security & Reliability Design

- **Auth**: bcrypt password hashing + Google OAuth + Phone OTP (AWS SNS) 2FA
- **Rate limiting, CSRF/XSS protection, input sanitization** at API layer
- **LLM resilience**: Groq (free/fast) primary → OpenAI auto-switch fallback on quota/failure — admin gets alert email
- **Tool resilience** (agent layer): every external tool call has a fallback chain (JSearch→Brave MCP→mock jobs; GitHub MCP→REST API; Calendar MCP→DB slots→generated slots) — koi bhi single external service down ho to feature completely nahi todta, degrade hota hai
- **Guardrail layer**: RAG-based answers ka faithfulness score check hota hai, low-confidence outputs human-review ke liye flag hote hain

---

## Part B: 10 Interview Q&A — Poora Project Present Karne Ke Liye

### Q1. Apne project ke baare mein 2-minute mein batao.

**A**: Maine ek **AI-powered HR platform** banaya hai jo do sides serve karta hai — job seekers ke liye resume analysis, AI mock interviews, aur auto-apply; recruiters ke liye bulk interview campaigns, candidate screening, aur ATS integration. Stack hai Next.js 16 + PostgreSQL frontend/backend ke liye, aur ek separate Python FastAPI microservice jisme 9+ LangGraph AI agents hain jo complex multi-step reasoning karte hain — jaise resume ko iteratively rewrite karna jab tak ATS score 70+ na ho jaye, ya ek candidate ko GitHub verification ke saath screen karna. Core differentiator ye hai ki interview questions **RAG pipeline** se candidate ke apne resume se personalize hote hain (Pinecone vector DB), aur poora system multiple layers pe **fallback/resilience** design follow karta hai — koi bhi ek external service (LLM, search API, calendar) fail ho to feature poori tarah nahi todta.

### Q2. System design kaise design kiya — components kaise split kiye?

**A**: Teen alag concerns ko teen layers mein split kiya:
1. **Next.js layer** — sab kuch jo low-latency hona chahiye (auth, real-time interview Q&A, chat) — Groq ko directly call karta hai, minimal hops.
2. **Python LangGraph microservice** — sab kuch jo **multi-step, stateful reasoning** maangta hai (resume rewrite loops, multi-agent panel interviews, screening pipelines) — LangGraph ka StateGraph isko explicit nodes/edges se model karta hai, debugging aur testing dono easy ho jaate hain.
3. **Data/retrieval layer** — Postgres (source of truth) aur Pinecone (semantic search) alag rakhe — relational data aur vector data ka use-case fundamentally different hai, ek hi DB mein force-fit nahi kiya.

### Q3. Sabse bada technical challenge kya tha, aur kaise solve kiya?

**A**: Do achhe examples hain:
1. **RAG retrieval quality** — pure vector similarity search kabhi generic-but-irrelevant chunks ko high score de deti thi. Maine ek **reranking step** add ki jo vector score ko lexical keyword-overlap ke saath blend karti hai (`70% vector + 30% lexical`) — over-fetch karke (topK×3) phir rerank karke top-K final karte hain. Isse query ke specific keywords wale chunks upar aate hain.
2. **Pinecone infra debugging** — production mein RAG kaam nahi kar raha tha, error tha `404: Resource "resume-coach" not found`. Root-cause karne ke liye pehle check kiya ki index exist karta hai ya nahi (nahi karta tha — banana pada, sahi dimension=1536 aur metric=cosine ke saath). Phir bhi 404 aaya — dubara diagnose kiya `pc.list_indexes()` se pata chala ki `.env` ka API key **ek alag Pinecone project** ka tha. Ye systematic debugging ka achha example hai — assumption test karo, evidence collect karo, phir fix karo.

### Q4. LLM integration kaise kiya — koi single point of failure to nahi?

**A**: Nahi — **primary/fallback pattern** har jagah hai. Groq (llama-3.3-70b) primary hai kyunki free/fast hai, OpenAI (gpt-4o-mini) automatic fallback hai jab quota hit ho ya Groq fail ho — admin ko alert email bhi jaata hai. Agent layer mein `get_llm()` ek shared utility hai jo ye decide karta hai — saare 9+ agents isi ko use karte hain, taaki fallback logic ek jagah centralized rahe, har agent mein duplicate na ho.

### Q5. RAG pipeline detail mein samjhao.

**A**: Resume upload hote hi text ko 500-word chunks mein todte hain (100-word overlap, sliding window), OpenAI `text-embedding-3-small` se embed karke Pinecone mein store karte hain (agar OpenAI key na ho to ek deterministic hash-based pseudo-embedding fallback hai, taaki system kabhi crash na ho). Interview ke time query banti hai `"{role} {roundType} interview questions skills experience"` se — top-5 chunks retrieve karke, similarity score>0.3 filter karte hain, phir reranking karte hain. Final prompt mein 60% resume-based + 40% general questions ka explicit split instruction diya jaata hai LLM ko — ye split programmatic post-filter se nahi, balki prompt-level instruction-following se honour hota hai.

### Q6. Multi-agent system (LangGraph) kyun use kiya, single-prompt kyun nahi?

**A**: Kuch tasks genuinely **multi-step aur stateful** hain jo single prompt mein reliably nahi ho sakte. Example: Resume Improvement Agent ko analyze → identify gaps → rewrite → re-score karna padta hai, aur agar score 70 se kam ho to **loop karke phir se rewrite** karna padta hai (max 3 iterations) — ye conditional looping LangGraph ke `add_conditional_edges` se declaratively define hoti hai. Panel Interview Agent mein 3 alag personas (Technical/HR/Domain) ek hi transcript ko independently evaluate karte hain, phir weighted consensus (50/25/25) banta hai — har persona ka apna node hai, isolated reasoning. Single mega-prompt se ye control aur observability nahi milti.

### Q7. Proctoring/integrity monitoring kaise kaam karta hai?

**A**: Browser-side signals collect hote hain interview ke dauran — tab-switch detection, face detection (no-face/multiple-faces/looking-away), background noise detection, clipboard/copy-paste activity. Har event ek violation timeline mein log hota hai, aur ek overall integrity flag (Clean/Warning/Suspicious) compute hota hai. Recruiter dashboard pe poori timeline dikhti hai — automated decision nahi leta system, sirf evidence surface karta hai human ke liye.

### Q8. Auto-apply feature kaise kaam karta hai — real job sites pe form kaise fill hota hai?

**A**: Pipeline hai: JSearch API se real job listings dhundhta hai (fallback: Brave Search MCP, phir mock data agar dono unavailable ho) → resume ko har job ke against match-score karta hai LLM se → jo threshold pass karte hain unke liye resume tailor karta hai aur cover letter generate karta hai. Form-filling ke liye **Playwright** (headless Chromium automation) use hota hai jo Greenhouse, Lever, Workday, aur custom career pages ke DOM ko detect karke fields fill karta hai — har step ka screenshot capture hota hai review ke liye, aur progress log rakhta hai ki kaunse fields fill hue. Application status track hota hai (Draft→Applied→Interview→Offer→Rejected).

### Q9. Agar production mein scale karna ho, kya bottleneck ho sakta hai aur kaise handle karoge?

**A**: Sabse pehla bottleneck **LLM rate limits/cost** hoga bulk campaigns pe — usko already Groq→OpenAI fallback se partially handle kiya hai, aur further caching (same JD ke liye repeated LLM calls avoid karna) add kar sakte hain. Dusra, **Pinecone query volume** — bulk resume RAG pe scale karne ke liye namespace-based partitioning aur batch upserts already hain. Teesra, **Playwright automation** — headless browser instances resource-heavy hote hain, isko ek separate worker-queue (jaise BullMQ/SQS) mein move karna padega jaise auto-apply volume badhega, abhi synchronous chalta hai.

### Q10. Agar aur time milta, kya improve karte / known limitations kya hain?

**A**: Kuch honest gaps hain jo maine khud identify kiye:
1. **Interview Evaluator Agent** LangGraph mein built hai lekin frontend se actually wired nahi hai — real feedback flow isko bypass karke directly Groq call karta hai. Ye dead-code jaisa hai, ya to wire karna chahiye ya remove.
2. **Market Intelligence Agent** naam ke bawajood koi live web-search nahi karta, sirf LLM ke training-knowledge (2024-25 tak) pe based hai — real-time salary/demand data ke liye ek live search tool (Brave/SerpAPI) integrate karna chahiye.
3. **RAG eval** abhi LLM-as-judge (lightweight approximation) hai — real `ragas` library ya ek proper NLI-based faithfulness checker zyada rigorous hoga, bas dependency-weight ka trade-off hai.
4. **Panel Interview Agent** ka docstring/comment khud kehta hai ki parallel evaluation ka plan tha (3 personas simultaneously), abhi sequential chalta hai — `asyncio.gather()` se easily parallelize ho sakta hai, latency kam hogi.
