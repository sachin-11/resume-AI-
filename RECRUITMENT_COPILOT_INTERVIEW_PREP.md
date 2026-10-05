# Recruitment Copilot Orchestrator — Interview Prep Doc

> Ye feature is repo mein **naya** add kiya gaya hai (2026-07 mein) — ek reference architecture diagram
> (Data sources → RAG pipeline → LangGraph orchestrator → sub-agents → MCP tool layer → Guardrail+eval)
> ko is codebase ke existing 9 LangGraph agents ke upar layer kiya gaya, jahan gaps the wahan naya bana ke.

---

## 1. Kya Problem Solve Kiya (30-second pitch)

Pehle is app mein **9 independent LangGraph agents** the (Resume Improvement, Candidate Screening, Auto-Apply, etc.) — har ek ka apna hardcoded REST endpoint tha. Next.js frontend khud decide karta tha ki kaunsa endpoint call karna hai. Koi **central routing layer** nahi tha jo ek free-text message le kar samajhe "ye resume-screening request hai ya scheduling hai ya FAQ hai" aur khud sahi agent pe bhej de.

Maine ek **LangGraph Orchestrator** banaya jo:
1. User ka free-text message classify karta hai (intent detection)
2. Sahi sub-agent pe route karta hai
3. Do **naye sub-agents** bhi banaye jo missing the: **Scheduler Agent** (calendar/interview slots) aur **FAQ Answerer Agent** (company policy docs pe RAG)
4. Existing RAG pipeline mein **reranking** add ki
5. Poore system ke upar ek **Guardrail + Eval layer** daala (hallucination detection + human-review flagging + observability)

---

## 2. High-Level Architecture

```
User message (free text)
        │
        ▼
┌─────────────────────────┐
│  LangGraph Orchestrator  │   agent-service/agents/orchestrator/
│  (classify_intent node)  │   POST /orchestrate
└─────────────┬────────────┘
              │  intent = resume_screening | scheduling | faq | other
              ▼
   ┌──────────┼──────────┬──────────────┐
   ▼          ▼          ▼              ▼
Resume     Scheduler    FAQ          Other
Screener   Agent        Answerer     (fallback)
(existing) (NEW)        (NEW)        LLM chat
   │          │            │              │
   └──────────┴─────┬──────┴──────────────┘
                     ▼
              finalize() node
        (Guardrail + Eval — human review flag,
         Langfuse trace, RAGAS-style scoring)
                     ▼
              Response to caller
```

---

## 3. Har Component Ka Kaam (Detail)

### 3.1 LangGraph Orchestrator — `agent-service/agents/orchestrator/`

**Files**: `state.py`, `nodes.py`, `graph.py`
**Graph flow**: `classify_intent → (conditional route) → {resume_screening | scheduling | faq | other} → finalize → END`

- `classify_intent` node: LLM ko (temperature=0, taaki consistent ho) user ka message deta hai, aur ek fixed JSON schema maangta hai: `{"intent": "...", "reasoning": "..."}`. Intent 4 buckets mein se ek: `resume_screening`, `scheduling`, `faq`, `other`.
- LangGraph ka `add_conditional_edges` use kiya routing ke liye — ek function (`route_by_intent`) state se intent padhta hai aur decide karta hai kaunsa node chalega.
- Har branch (resume_screening/scheduling/faq) apne respective sub-agent graph ko **as a sub-call invoke karta hai** (`await candidate_screening_agent.ainvoke(sub_state)`) — matlab orchestrator khud logic nahi likhta, existing/naye agents ko delegate karta hai. Isse code duplication nahi hoti.
- `finalize` node: sab branches ka common exit point — yahi pe guardrail check aur Langfuse trace hoti hai (section 3.5 dekho).

**Endpoint**: `POST /orchestrate` — Next.js is single endpoint ko free-text message ke saath call kar sakta hai, baaki routing automatic ho jaati hai.

---

### 3.2 Resume Screener — *existing agent reuse*

Ye pehle se tha (`agents/candidate_screening/`) — maine isse orchestrator se wire kiya, naya nahi banaya. Flow: `extract_info → fetch_github → match_jd → build_report`. GitHub verification MCP-first (GitHub MCP server), REST API fallback.

**Interview mein bolna**: *"Maine existing agent ko dobara nahi likha — orchestrator sirf ek routing/composition layer hai jo already-tested sub-agents ko reuse karta hai. Ye separation of concerns hai."*

---

### 3.3 Scheduler Agent — *naya, `agent-service/agents/scheduler/`*

**Graph flow**: `propose_slots → draft_confirmation → END`

**3-tier fallback design** (isi codebase ke existing pattern se copy kiya — jaise Auto-Apply agent mein JSearch→Brave→mock ka pattern hai):
1. **Tier 1 (opt-in)**: Calendar MCP tool — sirf tab try hota hai jab `GOOGLE_CALENDAR_MCP_COMMAND` + `GOOGLE_CALENDAR_MCP_ARGS` env vars explicitly set ho. Maine koi specific npm package hardcode nahi kiya kyunki koi verified/tested Google Calendar MCP server is project mein pehle se configured nahi tha — galat package guess karna production mein silently fail hone se bura hota.
2. **Tier 2 (default)**: App ke apne `InterviewSlot` Prisma model (`prisma/schema.prisma` mein pehle se maujood — `campaignId, startsAt, durationMin, isBooked`) se unbooked slots filter karke soonest 3 propose karta hai.
3. **Tier 3 (fallback)**: Agar koi slots hi nahi hain, pure Python se agle 5 weekdays ke business-hours (10am/1pm/3pm) slots generate kar deta hai.
4. Last node LLM se ek professional confirmation message draft karwata hai un proposed slots ke saath.

**Interview mein bolna**: *"Graceful degradation design hai — real Calendar API na ho tab bhi feature completely broken nahi hota, DB ya generated slots pe fall back karta hai."*

**Endpoint**: `POST /schedule-interview` (standalone bhi call ho sakta hai, orchestrator ke through bhi).

---

### 3.4 FAQ Answerer Agent — *naya, `agent-service/agents/faq/`*

**Graph flow**: `retrieve_docs → answer_question → eval_answer → END`

Ye classic **RAG pattern** hai (Retrieval Augmented Generation), company policy docs ke upar:

- **Storage** (`agents/faq/store.py`): Same Pinecone index reuse kiya jo TS RAG pipeline (`lib/rag.ts`) already use karta hai (`PINECONE_INDEX` env var, index name `resume-coach`) — naya index nahi banaya, balki metadata `type: "policy_doc"` se tag kiya taaki resume-chunks se collide na ho.
- **Chunking**: 500-word chunks, 100-word overlap — same convention jo TS side pe hai, consistency ke liye.
- **Embedding**: OpenAI `text-embedding-3-small` (1536-dim) agar `OPENAI_API_KEY` ho, warna deterministic **hash-based pseudo-embedding** (word-level DJB2 hash → bucket → L2 normalize) — safety net taaki Pinecone kabhi crash na ho, chahe koi embedding API key na ho.
- **Retrieval**: Query embed karke Pinecone se top-5 chunks, `score > 0.3` filter.
- **Answering**: LLM ko sirf retrieved context diya jaata hai, prompt explicitly kehta hai *"ONLY use context, don't invent facts"* aur answer ke end mein sources cite karwaye jaate hain.
- Agar koi relevant chunk nahi milta (empty retrieval), to answer khud "I don't have this info, check with HR" jaisa fallback deta hai — **hallucination se bachne ka pehla layer**.

**Endpoints**: `POST /faq/ingest` (doc index karne ke liye), `POST /faq/ask` (question poochne ke liye).

---

### 3.5 Rerank Step — `lib/rag.ts` (existing TS RAG pipeline mein add kiya)

Diagram mein "RAG pipeline: Chunk, embed, retrieve, **rerank**" tha — pehle rerank step missing tha, sirf raw vector-similarity score se sort hota tha.

**Kya add kiya**: Pinecone se **over-fetch** karte hain (`topK * 3`, max 15 candidates), phir ek **lexical + vector blended score** se rerank karte hain:

```
finalScore = vectorScore * 0.7 + lexicalOverlapScore * 0.3
```

`lexicalOverlapScore` = query ke kitne words chunk mein literally maujood hain (Jaccard-jaisa overlap ratio). **Kyun zaroori hai**: pure vector similarity kabhi kabhi ek generically-similar-lagta chunk ko high score de deti hai jismein query ke actual keywords (skill name, tool name) missing hote hain. Lexical overlap blend karne se keyword-specific chunks upar aate hain.

**Verify kaise kiya**: Ek standalone test likha (`node` se run kiya, TS logic ko plain JS mein copy karke) — 3 candidate chunks diye, jisme ek chunk highest vector score (0.60) tha but zero keyword overlap, aur do chunks lower vector score (0.55, 0.50) but keyword-rich the. Rerank ke baad keyword-rich chunks top pe aa gaye, generic chunk last pe chala gaya — expected behavior confirm hua.

**Interview mein bolna**: *"Full cross-encoder reranker (jaisa Cohere Rerank ya a local model) heavy hota — maine ek cheap, dependency-free lexical+vector blend implement kiya jo latency bhi nahi badhata aur no extra API call lagti."*

---

### 3.6 Guardrail + Eval Layer

Ye poore diagram ka sabse abstract box tha ("Human review, RAGAS, Langfuse") — do naye shared modules banaye:

**a) `agents/shared/eval.py` — RAGAS-style scoring (LLM-as-judge)**
- `evaluate_rag_answer(question, context_chunks, answer)` — ek hi LLM call mein do metrics score karwata hai (0.0–1.0 scale): **faithfulness** (kya answer sirf context se supported hai, koi hallucination nahi) aur **answer_relevancy** (kya answer actual question address karta hai).
- Ye **real `ragas` Python package nahi hai** — wo package heavy dependencies (datasets, sentence-transformers) laata, aur claim-decomposition + NLI-entailment model se rigorous scoring karta hai. Maine ek lightweight LLM-judge approximation banaya — same idea, kam accurate but production-guardrail ke liye kaafi.
- FAQ agent ke `eval_answer` node mein wired hai — har answer ke baad automatically chalta hai.

**b) `agents/shared/observability.py` — Langfuse tracing (fully opt-in)**
- `trace_guardrail(name, input, output, scores, metadata)` — agar `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` env vars set hain to Langfuse pe ek trace bhejta hai (Langfuse v4 ka naya OTEL-based API, `as_type="guardrail"` — ek first-class observation type jo Langfuse khud provide karta hai isi purpose ke liye).
- Agar keys set nahi hain (abhi is project mein set nahi hain), to **completely no-op** — koi error nahi aata, pipeline unaffected rehti hai.

**c) Human-review flagging heuristic** (orchestrator ke `finalize()` node mein):
- Resume screening mein agar decision = "reject" → flag
- FAQ mein agar koi source hi nahi mila (context-less fallback answer) → flag
- FAQ mein agar `faithfulness < 0.5` → flag ("possible hallucination")
- Scheduler/other mein agar sub-agent "not_implemented" status de → flag

**Interview mein bolna**: *"Guardrail ka matlab yahan ek automated gate hai jo low-confidence outputs ko human-review ke liye flag karta hai, aur observability (Langfuse) se production mein pattern dikhte hain ki kis type ke queries zyada fail ho rahe hain."*

---

## 4. Issues Jo Aaye Aur Kaise Fix Kiye

| # | Issue | Root Cause | Fix |
|---|---|---|---|
| 1 | `pinecone.errors.exceptions.NotFoundError: [404 NOT_FOUND] Resource resume-coach not found` | Pinecone index `resume-coach` naam ka **kabhi bana hi nahi tha** us Pinecone project mein — TS side (`lib/rag.ts`) mein bhi yahi gap tha pehle se (silent skip with a console warning) | Pinecone console mein manually index banaya — **dimension=1536** (OpenAI `text-embedding-3-small` / hash-fallback dono se match karne ke liye), **metric=cosine**, **vector type=Dense**, Serverless capacity. "Integrated embedding" (Pinecone-hosted model) select **nahi** kiya kyunki hamara code khud embeddings compute karke raw vectors upsert karta hai. |
| 2 | Index bana ke bhi wahi 404 error | `.env` ka `PINECONE_API_KEY` **ek alag Pinecone project** se belong karta tha (us key se `pathlab-health`, `chatbot-index` jaise unrelated indexes dikh rahe the, `resume-coach` nahi) | `pc.list_indexes()` se diagnose kiya ki key kis project ka hai → sahi project ("Sachin's Org → Default", jahan `resume-coach` bana tha) ka API key le kar `.env` update kiya |
| 3 | Test script mein `UnicodeEncodeError: 'charmap' codec can't encode` | Windows console (cp1252 encoding) emoji characters (`🚀`, `✅`) print nahi kar pata | Ye actual bug nahi tha — sirf local test-script ka print statement tha; agent logic khud sahi chal raha tha (verified output se) |
| 4 | Google Calendar MCP integration | Koi verified/tested Calendar MCP server package is project mein configured nahi tha, aur galat package name guess karna risky tha | Poori tier ko **opt-in banaya** (env-var configurable command/args/tool-name) — jab tak user apna verified package plug nahi karta, system automatically DB-slots ya generated-slots pe fallback karta hai, kabhi crash nahi hota |
| 5 | `ragas` package install karna heavy tha | Real RAGAS package `datasets`, `sentence-transformers` jaise heavy ML dependencies laata, jo is lightweight FastAPI microservice ke liye disproportionate hai | LLM-as-judge se lightweight approximation banaya (`agents/shared/eval.py`) — trade-off explicitly docstring mein likha hua hai |

---

## 5. Kaise Test/Monitor Kiya (Verification Approach)

Har step ke baad **actual execution se verify kiya**, sirf code likh ke chhoda nahi:

1. **Static checks**: Har naye graph ko compile karke node-list print karwaya (`orchestrator_agent.get_graph().nodes.keys()`) — confirm kiya sab nodes/edges sahi wire hue.
2. **Import/load checks**: Poora `main.py` (FastAPI app) import karke saari routes list ki — confirm kiya koi import error nahi, sab endpoints registered hain.
3. **Functional smoke tests (real LLM calls)**: Har naye agent (Scheduler, FAQ) ko directly `.ainvoke()` se real Groq LLM ke against chalaya, actual output dekha (e.g., Scheduler ne sahi generated slots + confirmation message banaya).
4. **Mocked-dependency tests**: Jab Pinecone index abhi live nahi tha, to `retrieve_policy_chunks` function ko monkeypatch kar ke FAQ agent ka **answering + eval logic** independently test kiya — isse pata chala ki code sahi hai, sirf external infra (Pinecone index) missing hai.
5. **Pure-logic unit tests**: Chunking function (`_chunk_text`) aur hash-embedding function (`_hash_embedding`) ko standalone chala ke verify kiya (chunk counts, vector dimension, normalization).
6. **TypeScript typecheck**: `npx tsc --noEmit` chalaya `lib/rag.ts` ke rerank changes ke baad — zero type errors confirm kiye.
7. **Algorithm correctness test**: Rerank blending logic ko ek standalone Node.js script mein test kiya specific candidate data ke saath, taaki prove ho sake ki keyword-relevant chunks generic-but-high-vector-score chunks ke upar aate hain.
8. **End-to-end real integration test**: Jab Pinecone index sahi se configure ho gaya (sahi project ka API key), to real ingest → real retrieve → real LLM answer → real eval score — poora pipeline live data ke saath chalaya aur confirm kiya (`faithfulness: 1.0, answer_relevancy: 1.0`).

**Interview mein bolna**: *"Maine har feature ko sirf likha nahi, balki turant ek chhota functional test likh ke actual execute kiya — jahan external dependency (Pinecone) available nahi thi, wahan us dependency ko mock kar ke baaki logic ko isolate karke test kiya. Jab infra ready hui, tab full end-to-end bhi verify kiya."*

---

## 6. Key Design Decisions (Talking Points)

- **Orchestrator sirf routing karta hai, business logic nahi** — har sub-agent apni state/nodes/graph khud manage karta hai. Orchestrator unhe compose karta hai. (Separation of concerns)
- **Fallback-tier pattern har naye agent mein reuse kiya** — ye already is codebase ka established convention tha (Auto-Apply: JSearch→Brave→mock; Candidate Screening: GitHub MCP→REST). Naye agents (Scheduler) ne isi pattern ko follow kiya — consistency.
- **Koi naya Pinecone index nahi banaya FAQ ke liye** — existing index ko metadata-tag se share kiya. Cost aur operational simplicity ke liye (ek hi index manage karna hai).
- **Sab kuch environment-variable gated hai jo external paid/complex services maangta hai** (Calendar MCP, Langfuse) — feature by default kaam karta hai, advanced integrations opt-in hain. Isse local dev aur demo dono mein bina extra setup ke chalta hai.
- **LLM-as-judge eval, real RAGAS nahi** — explicit engineering trade-off (dependency weight vs rigor), documented in code comments.

---

## 7. Likely Interviewer Questions + Answers

**Q: LangGraph kyun use kiya, plain if/else ya function chaining kyun nahi?**
A: LangGraph state ko explicitly typed rakhta hai (TypedDict), conditional edges declaratively define hoti hain (routing logic graph definition mein hi dikh jaati hai, code mein bikhri hui nahi), aur har node independently testable hai. Debugging ke liye `get_graph().nodes` se pura flow introspect ho sakta hai.

**Q: Agar Pinecone down ho jaye to kya hoga?**
A: FAQ agent gracefully "I don't have this info" fallback deta hai (empty chunks → no-context answer), aur guardrail automatically use `needs_human_review=True` flag kar deta hai kyunki `sources` empty hongi. System crash nahi karta.

**Q: Hallucination kaise prevent karte ho?**
A: Do layers — (1) prompt-level: LLM ko explicitly bola jaata hai "ONLY use given context", (2) post-hoc: `eval_answer` node faithfulness score nikalta hai aur agar low ho to human-review flag lagta hai. Ye "trust but verify" pattern hai.

**Q: Tumhara RAGAS eval real RAGAS se kaise different hai?**
A: Real RAGAS answer ko atomic claims mein todta hai aur har claim ko ek NLI/entailment model se context ke against verify karta hai — statistically rigorous. Mera version ek single LLM call mein LLM se khud judge karwata hai — faster, no extra dependencies, but less rigorous/more subjective.

**Q: Is orchestrator ko naye intents ke liye kaise scale karoge?**
A: `VALID_INTENTS` set mein naya intent add karo, classify_intent prompt mein uska description add karo, `graph.py` mein ek naya conditional-edge branch add karo jo naye sub-agent ko call kare. Baaki graph untouched rehta hai.

**Q: Scheduler agent real Google Calendar se kaise connect hoga production mein?**
A: `GOOGLE_CALENDAR_MCP_COMMAND` aur `GOOGLE_CALENDAR_MCP_ARGS` env vars mein ek verified MCP server (jaise `@cocal/google-calendar-mcp` type packages) configure karna hoga, plus OAuth credentials. Code already us tool ko generically call karne ke liye ready hai — sirf configuration ki baat hai, code change ki nahi.

**Q: Rerank step latency add nahi karta?**
A: Minimal — koi extra network call nahi hai (na embedding, na LLM), sirf ek in-memory JS array sort with a cheap Set-intersection calculation. Over-fetch (topK*3, max 15) bhi negligible extra Pinecone cost hai.

---

## 8. File Map (quick reference for demo)

```
agent-service/agents/orchestrator/     → central router (state.py, nodes.py, graph.py)
agent-service/agents/scheduler/        → interview slot proposal agent
agent-service/agents/faq/              → company-docs RAG agent (store.py has Pinecone logic)
agent-service/agents/shared/eval.py    → RAGAS-style LLM-judge scoring
agent-service/agents/shared/observability.py → Langfuse tracing (opt-in)
agent-service/main.py                  → /orchestrate, /schedule-interview, /faq/ingest, /faq/ask
lib/rag.ts                             → rerank logic added (rerankChunks, lexicalOverlapScore)
```
