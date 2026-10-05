# Multi-Agent System: Production Upgrade Log

> Is file mein har module ka record hai: **kya badla, kyun badla, kaise test kiya, interview mein kaise bolna hai**.
> Har naya module isi file mein neeche add hoga.

## Roadmap (status)

| Phase | Module | Status |
|---|---|---|
| 1 | `core/`: Config + LLM Gateway + Pydantic structured output + tests | ✅ Done (Module 1) |
| 1 | `core/observability.py`: per-node tracing, request ID, token/cost tracking | ✅ Done (Module 2) |
| 2 | `core/memory.py`: Postgres checkpointer, multi-turn Copilot + chat UI | ✅ Done (Module 3) |
| 2 | `core/auth.py`: per-user signed JWT + org_id (service auth) | ✅ Done (Module 4) |
| 3 | Human-in-the-loop: `interrupt()` gates + approval UI + atomic booking | ✅ Done (Module 5) |
| 3 | `tools/`: registry, risk levels, MCP pool | ⏳ Next |
| 4 | `supervisor/`: loop-style multi-step orchestrator, parallel panel | ⬜ |
| 5 | `runtime/`: job queue, SSE streaming, rate limit | ⬜ |
| 6 | `evals/` + `guardrails/`: CI gate, injection, bias | ⬜ |

---

# Module 1: LLM Gateway + Structured Output

## 1. Problem kya tha (pehle ki halat)

Har agent LLM ko seedha call karta tha, aur reply ko `safe_json_parse(text, fallback)` se parse karta tha. Isme 5 dikkatein thi:

| # | Problem | Asar |
|---|---|---|
| 1 | Provider sirf **startup par** choose hota tha (OpenAI key hai to OpenAI, warna Groq). Call ke beech OpenAI down ho to request fail ho jaati thi | Ek provider ka outage = poora agent down |
| 2 | **Retry aur timeout** set nahi the | 429 (rate limit) ya slow response par request atak jaati thi ya fail ho jaati thi |
| 3 | LLM ka reply **validate nahi** hota tha. `match_score: 150` ya `intent: "hack"` bhi aage chala jaata tha | Galat data seedha hiring decision mein |
| 4 | Parse fail hone par **hardcoded default** chupchaap use hota tha (`maybe`, `50`, `borderline`) | User ko lagta tha ye AI ka judgement hai, jabki woh sirf default value thi |
| 5 | `get_llm()` ki **do copies** thi (`agents/shared/llm.py` aur `agent/nodes.py`) | Ek jagah fix karo to doosri jagah reh jaata |

---

## 2. Kya banaya (naye files)

### `agent-service/core/config.py`: settings ek jagah
- `Settings` dataclass, `get_settings()` se ek baar load hota hai (`lru_cache`)
- Kya rakha hai: API keys, har provider ke **2 tiers ke model**, `LLM_TIMEOUT_S` (60), `LLM_MAX_RETRIES` (2), `LLM_STRUCTURED_ATTEMPTS` (2)
- `providers` property: jitne providers configure hain, priority order mein (`["openai", "groq"]`)
- **Kyun:** env vars agents mein bikhre hue the. Ab ek jagah se model ya timeout badal sakte hain, code chhede bina

### `agent-service/core/llm.py`: LLM Gateway
| Feature | Kaise kiya | Kyun |
|---|---|---|
| **Har call par provider fallback** | `primary.with_fallbacks([others])` (LangChain Runnable) | OpenAI fail ho to wahi request Groq par chali jaati hai |
| **Retry + timeout** | `ChatOpenAI` / `ChatGroq` ko `max_retries=2`, `timeout=60` | 429/5xx par backoff ke saath retry; koi call hamesha ke liye nahi atkegi |
| **Model tiers** | `get_llm(temperature, tier="fast" \| "reasoning")` | Routing aur judging ke liye sasta/fast model, generation ke liye bada. Abhi dono tiers ke defaults wahi purane models hain, env se badal sakte hain |
| **Instance caching** | `get_llm` par `lru_cache` | Har node mein naya HTTP client nahi banta |
| **Better JSON extraction** | `extract_json()`: code fence (```` ```json ````), aur aage-peeche ka extra text bhi handle karta hai | LLM aksar "Sure! Here is..." likh deta hai |
| **Structured output** | `ainvoke_structured(prompt, Schema, fallback=..., tier=, temperature=, name=)` aur sync `invoke_structured` | Neeche detail |
| **Usage logging** | Har call par `llm_call name=... model=... input_tokens=... output_tokens=...` | Pata chale kaunsa node kitne tokens kha raha hai (cost tracking ki shuruaat) |

**`ainvoke_structured` kaise chalta hai:**
```
LLM call → JSON nikalo → Pydantic schema se validate
   ├─ valid   → StructuredResult(data, fallback_used=False)
   └─ invalid → LLM ko error dikha ke ek baar dobara poochho ("score 150 is > 100, reply again with ONLY JSON")
                  ├─ valid   → return
                  └─ invalid → StructuredResult(fallback, fallback_used=True, error=...)  + warning log
```
- **Network/provider error** (retries aur fallback dono ke baad bhi) → exception **raise** hota hai, fallback ke peeche chhupta nahi. Outage ko error ki tarah dikhna chahiye, fake result ki tarah nahi.
- `fallback_used` flag ki wajah se caller ko pata hota hai ki ye AI ka asli judgement nahi hai.

### `agent-service/core/types.py`: reusable schema types
- `Score` = int 0–100: range ke bahar value aaye to reject karke dobara poochha jaata hai
- `UnitScore` = float 0.0–1.0 (eval metrics)
- `StrList` = `list[str]`: LLM `null` bheje to `[]` maana jaata hai

---

## 3. Kya badla (existing files)

| File | Change | Kyun |
|---|---|---|
| `agents/shared/llm.py` | Ab gateway ko hi call karta hai (`get_llm` re-export, `safe_json_parse` naye `extract_json` par) | **Saare ~12 agents** ko retry, timeout aur provider fallback **bina unka code chhede** mil gaya |
| `agent/nodes.py` | Duplicate `get_llm` / `safe_json_parse` hataye. `score_check` ab `invoke_structured` + `ScoreCheckOutput` schema use karta hai | Ek hi source of truth; score loop ka bug fix (neeche bug #2) |
| `agents/orchestrator/nodes.py` | `classify_intent` → `IntentOutput` schema (`intent: Literal[...]`), `tier="fast"`, temp 0. `VALID_INTENTS` set hataya, ab schema hi allowlist ka kaam karta hai. `finalize` mein `aiFallback` hone par human review | Router ka galat output pehle hi pakda jaata hai, aur dobara poochhne ka mauka bhi milta hai |
| `agents/candidate_screening/nodes.py` | `CandidateInfo` + `JDMatch` schemas. `screening_decision: Literal["shortlist","maybe","reject"]`, `match_score: Score`. Report mein `aiFallback` | Hiring decision hamesha valid aur flagged rahe |
| `agents/candidate_screening/state.py` | Naya field `ai_fallback: bool` | Fallback info state ke through report tak pahunchti hai |
| `main.py`, orchestrator `sub_state` | `"ai_fallback": False` initial state mein. `logging.basicConfig` (`LOG_LEVEL` env) | Gateway ke logs dikhein |
| `agents/interview_panel/graph.py` | `TechnicalVerdict`, `HRVerdict`, `DomainVerdict` schemas + `_evaluate()` helper. Consensus report mein `degradedAgents` + warning note | Kaunsa panelist asli tha aur kaunsa default, recruiter ko dikhe |
| `agents/shared/eval.py` | RAG judge → `RagScores` schema (`UnitScore`), `tier="fast"`, temp 0. Fallback `0.0` | Bug #1 fix |
| `AGENTS_MULTI_AGENT_INTERVIEW_PREP.md` | `VALID_INTENTS` aur `+5` wali lines update ki | Doc code se match kare |

---

## 4. Teen asli bugs jo pakde aur fix kiye

### Bug #1: Hallucination guardrail bypass ho jaata tha (sabse serious)
- **Pehle:** RAG judge ka reply parse na ho to `faithfulness = 0.5`. Guardrail ki condition `< 0.5` hai, to `0.5` **pass** ho jaata tha.
- **Matlab:** Jis answer ko kisi ne evaluate hi nahi kiya, woh "safe" maan ke bina review ke user tak chala jaata tha.
- **Ab:** Fallback `0.0` hai, to guardrail trip hota hai aur answer human review mein jaata hai. **Fail-closed, fail-open nahi.**

### Bug #2: Resume loop fake improvement report karta tha
- **Pehle:** `score_check` parse fail par `new_score = current_score + 5`. User ko "+5 improvement" dikhta tha jo hua hi nahi.
- **Ab:** Score **unchanged** rehta hai, log mein `⚠️ scorer reply invalid — score unchanged` aata hai. Loop phir bhi `max_iterations` se band hota hai.

### Bug #3: Screener ka default result asli lagta tha
- **Pehle:** Parse fail → `maybe / 50`, aur yeh baaki results jaisa hi dikhta tha.
- **Ab:** `aiFallback: true` report mein, orchestrator `needs_human_review = True` + reason *"decision is a default, not an AI judgement"*. Panel mein `degradedAgents: ["technical"]` + note.

---

## 5. Behaviour mein badlaav

| Change | Kyun | Trade-off |
|---|---|---|
| Classification / scoring / judge calls ka temperature **0.3 → 0** | Same input par same result (consistency, reproducibility) | Kam variety, lekin scoring mein variety chahiye bhi nahi |
| Invalid reply par **ek extra LLM call** (re-ask) | Pehle seedha default chala jaata tha, ab ek aur mauka milta hai | Sirf invalid case mein thoda zyada token aur latency |
| Out-of-range values (score > 100, unknown intent) **reject** hoti hain | Galat data decision tak na pahunche | — |

---

## 6. Testing

**Unit tests** (`agent-service/tests/`, fake LLM ke saath, koi API call nahi):
- `conftest.py`: `fake_llm` fixture, `core.llm.get_llm` ko `FakeListChatModel` se replace karta hai
- `test_llm_gateway.py` (10 tests): JSON extraction (fences, prose, no-JSON), valid reply, `null` → `[]`, re-ask ke baad sahi reply, do baar invalid → flagged fallback, sync variant
- `test_decision_nodes.py` (6 tests): router unknown intent → `other`, screener fallback → human review, RAG judge fail → guardrail trip, score_check fallback → score unchanged, panel `degradedAgents`

```bash
cd agent-service
venv/Scripts/python.exe -m pip install -r requirements-dev.txt
venv/Scripts/python.exe -m pytest tests        # 16 passed
```

**Live smoke test:** Router par ek asli call chalayi. Model `gpt-4o-mini`, 142 input + 26 output tokens, intent `scheduling` sahi aaya. Provider chain `RunnableWithFallbacks` (OpenAI → Groq) ban rahi hai, yeh bhi confirm kiya.

---

## 7. Abhi kya baaki hai (Module 1 ke andar)

- ~15 nodes (job_match, learning_path, market_intelligence, auto_apply, interview_evaluator, daily_ops, resume analyze/rewrite) abhi bhi `safe_json_parse` par hain. Unhe retry + fallback mil gaya hai, **schema validation nahi**. Inhe dheere-dheere migrate karna hai.
- Token usage abhi sirf log hota hai, `AiUsageLog` table mein save nahi hota (yeh observability module mein hoga).
- `fast` tier ke liye abhi bhi bada model hai. Chhota model (jaise `llama-3.1-8b-instant`) env se set karne se pehle router accuracy eval karni chahiye.

---

## 8. Interview mein kaise bolna hai

> "Maine saare agents ke neeche ek **LLM gateway** banaya. Isme har call par provider fallback hai (OpenAI → Groq), retries ke saath timeout hai, aur model tiers hain. Sabse important hai **schema-validated output**: har decision node ka reply Pydantic model se validate hota hai. Invalid ho to model ko error dikha ke ek baar dobara poochha jaata hai, aur tab bhi fail ho to default use hota hai **lekin `fallback_used` flag ke saath**, jo human review trigger karta hai. Isi kaam mein maine ek guardrail bypass pakda: judge fail hone par faithfulness 0.5 set hota tha, jo threshold pass kar jaata tha. Use fail-closed kiya. Saath mein fake LLM ke saath unit tests likhe, taaki bina API cost ke decision logic test ho sake."

**Follow-up sawaal jo aa sakte hain:**
- *"`with_structured_output` kyun nahi use kiya?"* Groq aur OpenAI dono par same behaviour chahiye tha, existing prompts already JSON maangte the, aur error dikha ke re-ask (repair loop) ka control mujhe khud chahiye tha. Native structured output ek valid next step hai.
- *"Network error par fallback kyun nahi diya?"* Outage ko fake result ke peeche chhupana galat hai. Data galat ho to fallback + flag, infrastructure fail ho to error.
- *"Fail-open vs fail-closed?"* Safety checks (guardrail, eval) hamesha fail-closed honi chahiye. Agar check chal hi nahi paaya, to answer ko unsafe maano.

---

# Module 2: Observability (Tracing + Request ID + Cost)

## 1. Problem kya tha

| # | Problem | Asar |
|---|---|---|
| 1 | Langfuse mein sirf **guardrail events** jaate the (orchestrator finalize, FAQ eval). Kaunsa node chala, kitna time laga, kaunsi LLM call slow thi, yeh kuch nahi dikhta tha | Production mein "agent slow hai / galat answer de raha hai" ko sirf andaaze se debug kar sakte the |
| 2 | Logs mein **request ID nahi** tha | Concurrent traffic mein ek run ke logs alag karna mumkin nahi tha |
| 3 | Agent-service ka **token/cost track nahi** hota tha. `AiUsageLog` mein sirf Next.js ki direct Groq/OpenAI calls aati thi | Admin cost dashboard mein LangGraph agents ka kharcha gayab tha |
| 4 | Har guardrail event par `lf.flush()` hota tha (request ke andar synchronous network call) | Har request ka latency badhta tha |
| 5 | `pricing.ts` exact model naam match karta tha, lekin provider `gpt-4o-mini-2024-07-18` return karta hai | Aisi calls ki cost `$0` record hoti |

**Sabse badi constraint:** commit `5856a40` mein Langfuse ko candidate PII (resume, answers) bhejna band kiya gaya tha. Per-node tracing mein har prompt Langfuse jaata hai, isliye tracing aisi chahiye thi jo privacy na tode.

---

## 2. Kya banaya

### `agent-service/core/observability.py`

| Piece | Kya karta hai | Kyun |
|---|---|---|
| **Langfuse client with `mask`** | Client banate waqt `mask=_mask` diya. SDK har span ke input/output/metadata par yeh chalata hai: har string `[redacted — N chars]` ban jaati hai; numbers, bools aur structure same rehte hain. Unknown objects `[redacted ClassName]` ban jaate hain (**fail-closed**) | Privacy ek hi jagah se lagti hai, kisi node ko redact karna yaad nahi rakhna padta. Mask function khud crash ho jaaye to bhi SDK poora data "fully masked" kar deta hai |
| `LANGFUSE_CAPTURE_CONTENT=true` | Masking band (sirf dev / synthetic data ke liye) | Kabhi debugging mein content dekhna ho |
| `environment`, `release`, `sample_rate` | `APP_ENV`, `RAILWAY_GIT_COMMIT_SHA`, `LANGFUSE_SAMPLE_RATE` se | Prod aur dev traces alag rahein; pata chale kaunse deploy mein regression aaya; high traffic par sampling |
| **`UsageCollector`** (LangChain callback) | `on_llm_end` par har call ke tokens model-wise jodta hai | Ek run (sub-agents samet) ke total tokens aur calls. Callback level par hai, to purane `get_llm()` wale nodes bhi count hote hain |
| **`run_config(agent, usage, user_id)`** | LangGraph config banata hai: callbacks (usage + Langfuse handler), `langfuse_trace_name`, tags `agent:<name>` + `request:<id>`, `langfuse_user_id` | Har run Langfuse mein agent ke naam se ek trace banta hai, jo request ID se search ho sakta hai |
| **`run_agent(agent, graph, state, user_id)`** | `graph.ainvoke(state, config=...)` chala ke `(final_state, usage_summary)` return karta hai, aur ek `agent_run` log line likhta hai | Saare endpoints ek hi tarike se trace hote hain |
| **Request ID** | `request_id_var` (ContextVar); `new_request_id()` caller ka `x-request-id` tabhi maanta hai jab woh ≤64 chars aur alphanumeric/dash ho, warna naya uuid banata hai; `RequestIdLogFilter` | Har log line mein `[req=...]`. Galat ya injected header (newline wagairah) logs tak nahi pahunchta |
| `trace_guardrail` | Ab har baar `flush()` nahi karta, aur alag `_redact` ki zaroorat nahi (client khud mask karta hai) | Request path se network call hat gaya |
| `flush()` | FastAPI `lifespan` shutdown par chalta hai | Redeploy par buffered spans drop na hon |

`agents/shared/observability.py` ab sirf re-export hai, taaki purane imports chalte rahein.

### `agent-service/main.py`
- **Request-ID middleware**: har response mein `x-request-id` header
- Log format: `%(asctime)s %(levelname)s %(name)s [req=%(request_id)s] %(message)s`
- `lifespan` handler (deprecated `@app.on_event` ki jagah), jo shutdown par flush karta hai
- **Saare 12 agent endpoints** ab `run_agent(...)` se chalte hain, aur response mein **`usage`** field hai:
  ```json
  "usage": {"calls": 2, "input_tokens": 184, "output_tokens": 60,
            "by_model": {"gpt-4o-mini-2024-07-18": {"calls": 2, "input_tokens": 184, "output_tokens": 60}}}
  ```
  `improve-resume` aur `job-match` mein `user_id` bhi Langfuse ko jaata hai. Yeh internal cuid hai, aur Next.js bhi ise pehle se bhejta hai.

### `agent-service/requirements.txt`
- **`langchain==0.3.30` add kiya.** Langfuse ka LangChain `CallbackHandler` iske bina load nahi hota. Yeh live test mein pakda gaya (`Please install langchain...`). `0.3.x` liya taaki existing `langchain-core 0.3.86` ke saath compatible rahe; `pip check` clean hai.

### Next.js side
| File | Change | Kyun |
|---|---|---|
| `lib/agentUsage.ts` (naya) | `logAgentUsage(usage, {userId, feature})`: har model ke liye ek `AiUsageLog` row (`feature: "agent:<name>"`), cost `calcCostUsd` se. Fire-and-forget | Admin cost dashboard mein agent runs bhi aayein, user ke hisaab se |
| 8 agent routes (`agents/*`, `job-match-agent`, `resume/improve`, `auto-apply/fetch-jobs`) | Agent ka response aane ke baad `logAgentUsage(...)` | Same |
| `lib/pricing.ts` | `pricingFor()`: exact match na mile to **longest prefix** match | `gpt-4o-mini-2024-07-18` ko `gpt-4o-mini` ki pricing milti hai. Pehle `$0` aata tha |

---

## 3. Verification

**Unit tests**: `tests/test_observability.py` mein 5 naye tests (total **21 passed**):
- `redact` structure rakhta hai aur content hata deta hai; unknown object par fail-closed
- Langfuse configure na ho to sirf usage callback lagta hai (koi network call nahi)
- `run_agent` 3 nodes aur ek **sub-graph (jise config pass nahi kiya)** ki usage sahi jodta hai. Isse confirm hua ki config contextvars se sub-graphs tak propagate hota hai
- Request ID: naya mint hota hai, valid caller ID aage jaata hai, aur `"bad id\nINJECT"` jaisa header reject hota hai
- `conftest.py` Langfuse keys khaali kar deta hai, taaki tests kabhi asli project mein traces na bhejein

**Live end-to-end** (synthetic message, asli Langfuse project):
```
trace "orchestrate" (tags: agent:orchestrate, request:smoketest-obs-004) → 9 observations
  orchestrate → classify_intent → RunnableWithFallbacks → ChatOpenAI (GENERATION)
             → route_by_intent → other → RunnableWithFallbacks → ChatOpenAI → finalize
input: {"user_message": "[redacted — 33 chars]", ...}     ← PII masked ✅
GENERATION: model gpt-4o-mini-2024-07-18, usage 142/29 tokens, cost $0.0000387, temperature 0 ✅
```
- `npx tsc --noEmit` mein koi error nahi. ESLint mein sirf 4 purane warnings hain (`auto-apply/fetch-jobs` ke unused imports, is change se nahi)

**Live test mein ek alag issue mila (is module se related nahi):** Local par Pinecone index `resume-coach` **exist nahi karta** (404 `NOT_FOUND`), isliye FAQ branch crash ho jaati hai. `.env` ka `PINECONE_INDEX` check karna hai, ya index banana hai.

---

## 4. Trade-offs aur jo baaki hai

| Point | Detail |
|---|---|
| Masked traces mein prompt ka content nahi dikhta | Structure, timing, model, tokens, cost aur errors dikhte hain. Content dekhna ho to synthetic data ke saath `LANGFUSE_CAPTURE_CONTENT=true` |
| Metadata bhi masked hai | `langgraph_node` jaisa string metadata bhi redact hota hai. Node ka naam span name mein dikhta hai, isliye tree readable rehta hai |
| `trace_guardrail` ka score | Guardrail event abhi shayad alag trace mein jaata hai; run ke trace mein nest hota hai ya nahi, yeh verify nahi kiya. Next step: score ko run ke trace ID se attach karna |
| Next.js `x-request-id` nahi bhejta | Abhi ID agent-service banata hai. Next.js ID bheje aur apne logs mein bhi print kare, tab end-to-end correlation poori hogi |
| Metrics / alerts | Prometheus/OTel metrics aur alerting (error rate, cost per day) abhi nahi hain. Tab tak Langfuse dashboards se kaam chal sakta hai |
| `/faq/ingest` | Yeh graph run nahi hai, isliye `run_agent` se trace nahi hota |

---

## 5. Interview mein kaise bolna hai

> "Har agent run ek Langfuse trace hai. Usme har LangGraph node, har LLM call, model, tokens, latency aur cost ek tree mein dikhte hain, to 'kaunsa node slow hai' ya 'kahan galat route hua' seedha dikh jaata hai. Hiring data mein PII hota hai, isliye maine Langfuse client par ek **mask function** lagaya: har string length-placeholder ban jaati hai, aur unknown type fail-closed hota hai. Third-party vendor ko structure aur metrics milte hain, content nahi. Har request ka ek **request ID** hai jo logs, trace tags aur response header mein jaata hai. Token usage ek callback se poore run (sub-agents samet) ke liye collect hota hai, response mein wapas jaata hai, aur Next.js use `AiUsageLog` mein user ke naam se save karta hai. Isi kaam mein ek pricing bug bhi pakda: dated model names ki cost $0 aa rahi thi."

**Follow-up sawaal:**
- *"Sab mask kar diya to debug kaise karoge?"* Structure, timing aur token count se zyadatar issues pakde jaate hain. Content-level debugging dev environment mein synthetic data aur `LANGFUSE_CAPTURE_CONTENT=true` ke saath hoti hai. Production ka content first-party DB mein rehta hai, third-party mein nahi.
- *"Callback vs manual logging?"* Callback framework level par lagta hai, to naye nodes ya sub-agents apne aap trace hote hain. Manual logging mein koi na koi node chhoot jaata.
- *"Sub-graph ki calls kaise count hui?"* Python 3.11+ mein LangChain config contextvars ke through child runnables tak propagate hota hai. Yeh maine ek test se verify kiya.

**Update (Module 3 ke dauraan):** Pinecone wala issue fix ho gaya. `agent-service/.env` mein kisi **doosre Pinecone project** ki API key thi (index ka naam sahi tha). Root `.env` wali key copy karne ke baad FAQ agent chal gaya (`Leave Policy` source, faithfulness 1.00). **Railway par bhi yeh key check karni hai.**

---

# Module 3: Conversation Memory (Multi-turn Recruitment Copilot)

## 1. Problem kya tha

| # | Problem | Asar |
|---|---|---|
| 1 | Orchestrator **stateless** tha: har message akela process hota tha | "Is candidate ko screen karo" ke baad "**usko** interview ke liye schedule karo" kaam nahi karta tha. Har baar resume + JD dobara bhejna padta tha |
| 2 | Checkpointer nahi tha | Crash/redeploy par chalti conversation khatam; HITL pause/resume (Module 5) ke liye bhi base nahi tha |
| 3 | **Next.js mein orchestrator ka koi UI ya route hi nahi tha** (`/orchestrate`, `/schedule-interview`, `/faq/*` kisi ne call nahi kiye) | Recruitment Copilot sirf backend par tha, user use nahi kar sakta tha |

---

## 2. Backend kya banaya

### `agent-service/core/memory.py`
| Piece | Kya | Kyun |
|---|---|---|
| **AsyncPostgresSaver** (`langgraph-checkpoint-postgres`) + `psycopg_pool` | Har graph step ke baad state Postgres mein save hoti hai | Restart, redeploy aur multiple replicas ke baad bhi conversation bachi rehti hai |
| **Alag schema `agent_memory`** | Pool connections `search_path=agent_memory` par hain; schema startup par ban jaata hai | Prisma sirf `public` dekhta hai. Tables `public` mein hoti to `prisma migrate dev` unhe "drift" samajh ke **DB reset** karne ko kehta |
| `_libpq_url()` | `DATABASE_URL` se Prisma-only params (`schema=`, `connection_limit`, `pgbouncer`…) hata deta hai | libpq inhe reject karta hai; same URL dono jagah chal sake |
| **In-memory fallback** (`MemorySaver`) | Jab `DATABASE_URL` na ho, `AGENT_MEMORY=memory` ho, ya **Windows ProactorEventLoop** ho | psycopg async Windows ke Proactor loop par nahi chalta, aur local MCP client (subprocess) ko wahi loop chahiye. Isliye local Windows dev in-memory, production (Linux) Postgres. Warning log hota hai; `/health` mein `memory` backend dikhta hai |
| Postgres connect fail → in-memory + **ERROR log** | Availability bani rehti hai, lekin log mein saaf likha jaata hai ki conversations restart par nahi bachengi | — |
| **`thread_key(user_id, thread_id)`** | Checkpointer thread = `"<user_id>:<thread_id>"`. Dono IDs regex `^[A-Za-z0-9_-]{1,64}$` se validate hote hain | **User isolation**: thread ID guess bhi ho jaaye to doosre user ki conversation nahi khulti. `:` smuggle karke namespace todna mumkin nahi |

### Orchestrator (`agents/orchestrator/`)
| Change | Kyun |
|---|---|
| State mein `messages: Annotated[list[AnyMessage], add_messages]` | Conversation history; har turn user message + assistant reply jodta hai |
| `build_orchestrator_agent(checkpointer=None)` | API startup par checkpointer ke saath compile; stateless instance bhi bacha hai |
| `classify_intent` ko **pichle 6 messages** dikhte hain | "her", "that role", "same time" jaise references resolve hote hain |
| Router prompt: `other` = **"is conversation ke baare mein sawaal"** (recap), `faq` = sirf company policy docs | Live test mein "which skills was she missing?" `faq` par ja raha tha (galat). Fix ke baad `other` history se sahi jawab deta hai |
| `run_other` ab pichle 10 messages ke saath chat karta hai | Recap aur follow-up sawaalon ka jawab history se |
| `finalize` → `_reply_text()` se ek **AIMessage** history mein | Screening: decision + rating + matched/missing skills; scheduling: confirmation; FAQ: answer |
| Sub-agents (`candidate_screening`, `scheduler`, `faq`) `compile(checkpointer=False)` | Parent checkpointer ke andar unke internal steps save na hon. Warna resume text dobara DB mein jaata (duplicate PII) aur storage waste hota |

### `main.py` / API
| Endpoint | Detail |
|---|---|
| `POST /orchestrate` | Naye optional `user_id`, `thread_id`. `user_id` ho to turn thread mein persist hota hai (naya `thread_id` mint hota hai, response mein wapas). **Bina `user_id` purana stateless behaviour** (backward compatible) |
| | **Per-turn fields reset** (intent, results, review flags), taaki pichle turn ka data leak na ho |
| | **Context fields** (resume, JD, candidate, slots) sirf tab overwrite hote hain jab bheje jaayein, warna thread mein yaad rehte hain |
| | `logs` thread mein append-only hai, response mein **sirf is turn ke** logs (`logs_before` se slice) |
| | Response mein `reply`, `thread_id`, `memory` |
| `GET /threads/{id}?user_id=` | History + context flags (`has_resume`, `has_job_description`, `candidate_name`). Content nahi, sirf flags |
| `DELETE /threads/{id}?user_id=` | Thread ke saare checkpoints permanently delete (`adelete_thread`) |
| `lifespan` | Startup par checkpointer + copilot graph, shutdown par pool close |
| `run_agent(..., thread=)` | `configurable.thread_id` + Langfuse **`session_id`**, taaki ek conversation ke saare turns Langfuse mein ek session mein dikhein |

---

## 3. Frontend kya banaya

| File | Kya |
|---|---|
| `lib/permissions.ts` | Naya `useRecruiterCopilot: ["admin", "recruiter"]` |
| `lib/copilot-agent.ts` | `copilotUser()` (session + role check), `THREAD_ID_RE` (agent-service jaisa hi regex), agent URL/secret |
| `app/api/recruiter-copilot/route.ts` | `POST`: zod validation, resume **ownership check** (`userId` se), user ke campaigns ke **future unbooked `InterviewSlot`** har turn fresh, `user_id = session.user.id` (client kabhi user_id nahi bhejta), `logAgentUsage` |
| `app/api/recruiter-copilot/[threadId]/route.ts` | `GET` history, `DELETE` conversation (Next 16 pattern: `params` ek Promise hai) |
| `app/(dashboard)/recruiter-copilot/page.tsx` | Chat UI: **Context panel** (resume, candidate, JD), jo sirf *badle hue* fields agle message ke saath bhejta hai; "remembered: resume · job description · Asha" indicator; har reply par **intent badge**, **human-review warning** + reasons, FAQ **sources**, proposed **slots**; New/Delete conversation; reload par history restore (thread ID `localStorage` mein, try/catch ke saath) |
| `components/layout/sidebar.tsx` | Recruiter + Admin nav mein "Recruitment Copilot" |
| `proxy.ts` | `/recruiter-copilot` protected (login zaroori); `/api/recruiter-copilot` par rate limit **20/min** (har turn mein kai LLM calls) |

Naam `recruiter-copilot` rakha, kyunki `/interview/copilot` ("AI Copilot") pehle se ek alag feature hai.

---

## 4. Verification

**Unit tests**: `tests/test_memory.py`, 7 naye tests (total **28 passed**):
- `thread_key` unsafe IDs (`a:b`, empty, 65 chars) reject karta hai
- `_libpq_url` Prisma params hata deta hai, `sslmode` rakhta hai
- **Multi-turn**: turn 2 ke router prompt mein turn 1 ka message tha; history 4 messages; turn 1 ka `candidate_name` turn 2 mein yaad; logs per-turn
- **Isolation**: `alice` ka thread `mallory` ke liye `exists: false`
- Delete ke baad thread gayab; `../../etc` thread ID → 400; bina `user_id` stateless

**Postgres (asli local DB, Postgres 18)**:
```
backend: postgres
after restart → messages: ['human','ai','human','ai'] | candidate_name: Priya   ← naya pool, data bacha ✅
tables: agent_memory.checkpoint_blobs / checkpoint_migrations / checkpoint_writes / checkpoints  ← public mein nahi ✅
checkpoints left after delete: 0 ✅
```
`prisma db pull` mein koi checkpoint table nahi dikhi, `prisma migrate status`: "Database schema is up to date!"

**Live multi-turn (asli LLM, synthetic candidate "Asha Verma")**:
```
TURN 1 "screen this candidate"            → resume_screening: SHORTLIST 85/100, Missing: Django, Kubernetes
TURN 2 "propose slots for her next week"  → scheduling, "Hi Asha, ..."   ← "her" history se resolve ✅
TURN 3 "which skills was she missing?"    → other: "Asha was missing experience with Django and Kubernetes." ✅
```
(Router fix se pehle turn 3 galti se `faq` par ja raha tha.)

**Frontend**: `npx tsc --noEmit` clean; naye files ESLint clean (`sidebar.tsx` ke 2 issues pehle se the). **UI browser mein abhi test nahi hua**, kyunki recruiter login chahiye.

---

## 5. Trade-offs aur jo baaki hai

| Point | Detail |
|---|---|
| Windows local dev = in-memory memory | Server restart par conversations jaati hain. Production Linux par Postgres |
| Thread retention / TTL nahi | Conversations tab tak rehti hain jab tak delete na ho. Next step: purane threads ka cleanup job (jaise 30 din) |
| Same thread par concurrent requests | UI send button disable karta hai, lekin API level par lock nahi hai |
| `logs` thread mein badhte rehte hain | Response mein slice hota hai, lekin checkpoint mein poori list rehti hai. Lambi conversations ke liye cap karna hai |
| Threads ki list nahi | UI ek hi current thread `localStorage` mein rakhta hai. Purani conversations ki list ke liye threads table chahiye |
| Scheduler "next week" nahi samajhta | Slots kal se generate hote hain (purana behaviour, `requested_timeframe` use nahi hota) |
| Long-term / episodic memory | Abhi sirf thread (short-term) memory hai. Recruiter preferences aur candidate history ke liye LangGraph `Store` agla step |

---

## 6. Interview mein kaise bolna hai

> "Recruitment Copilot ab multi-turn hai. Orchestrator LangGraph **Postgres checkpointer** ke saath compile hota hai, to har step ke baad state save hoti hai: conversation restart ke baad bhi rehti hai, aur yahi aage human-in-the-loop pause/resume ka base banega. State mein `add_messages` reducer se history hai. Router ko pichle turns dikhte hain, isliye 'usko schedule karo' jaisa reference resolve hota hai, aur resume/JD ek baar dene ke baad thread mein yaad rehte hain. Per-turn fields har turn reset hote hain, taaki pichle turn ka data leak na ho. Security ke liye thread key user ID + thread ID hai, dono regex-validated, to doosre user ka thread kabhi nahi khulta. Tables alag Postgres schema mein hain, taaki Prisma migrations unhe drift na samjhein. Sub-agents `checkpointer=False` hain, taaki resume text duplicate store na ho. Live testing mein ek routing bug bhi mila: recap sawaal FAQ par ja raha tha. Prompt mein intent boundary clear karke fix kiya."

**Follow-up sawaal:**
- *"Checkpointer vs apni messages table?"* Checkpointer poori graph state save karta hai (sirf messages nahi), aur `interrupt()` / resume / time-travel ke liye zaroori hai. Apni table sirf chat history deti.
- *"Short-term vs long-term memory?"* Checkpointer = ek thread ki memory. Long-term (cross-thread, jaise recruiter preferences) ke liye LangGraph `Store` ya vector DB, namespace per user/org.
- *"Memory mein PII ka kya?"* First-party Postgres mein hai, Langfuse mein masked. Delete endpoint hai; retention/TTL agla kaam hai.

---

# Module 4: Service Auth (Per-user Signed JWT + org_id)

## 1. Problem kya tha

| # | Problem | Asar |
|---|---|---|
| 1 | Next.js → agent-service har request mein **ek hi shared secret** (`x-agent-secret`) **plaintext header** mein bhejta tha | Secret ek baar leak ho (log, proxy, misconfigured HTTP) to koi bhi saare agents chala sakta tha, hamesha ke liye (expiry nahi) |
| 2 | Agent-service ko **pata nahi tha request kis user ki hai**. `user_id` request **body** mein aata tha | Secret wala koi bhi caller kisi bhi user ka `user_id` bhej ke uske **Copilot threads padh/delete** kar sakta tha (Module 3 ki isolation body par depend karti thi) |
| 3 | `org_id` (team/organization) agent-service tak nahi pahunchta tha | Multi-tenant features (org-level memory, org-level cost, org-scoped data) ka base nahi tha |

---

## 2. Design

```
Next.js route (session user)                       agent-service
──────────────────────────                         ─────────────
agentHeaders({id, orgId, role})                    get_caller()  ← har endpoint par Depends
  JWT HS256, key = AGENT_SECRET                       Authorization: Bearer <jwt>
  iss=resume-ai-web  aud=agent-service                  → verify: HS256 only, aud, iss, exp, iat, sub
  sub=<userId> org=<orgId> role=<role>                  → Caller(user_id=sub, org_id, role)
  iat, exp=+120s, jti=uuid                            koi token nahi → legacy x-agent-secret (migration ke liye)
                                                      token invalid → 401 (legacy par fallback NAHI)
```

| Decision | Kyun |
|---|---|
| **Secret ab sirf signing key** | Token mein secret nahi jaata, sirf HMAC signature. Ek token leak ho to bhi woh 2 minute mein expire, aur sirf usi user ke liye valid |
| **User identity token se** (`resolve_user_id`) | Body ka `user_id` token se alag ho to **403**. Thread endpoints ab `user_id` query param ke bina chalte hain (token se) |
| `algorithms=["HS256"]` **pinned** | `alg: none` aur algorithm-confusion attacks reject |
| `aud` + `iss` check | Kisi aur service ke liye bana token yahan kaam nahi karega |
| `exp` 120s + 30s leeway | Clock skew tolerate, lekin replay window chhota |
| **Invalid token → reject, downgrade nahi** | Attacker galat token + purana secret bhej ke weak path par nahi ja sakta |
| **Legacy secret migration ke liye on** (`AGENT_ALLOW_LEGACY_SECRET`, default `true`) | Next.js (Amplify) aur agent-service (Railway) alag deploy hote hain; jo pehle deploy ho, dono kaam karte rahein |
| Koi naya env var zaroori nahi | Signing key wahi `AGENT_SECRET` hai jo dono taraf pehle se set hai |
| `org_id` → Langfuse tag `org:<id>` (`caller_var` ContextVar) | Traces org ke hisaab se filter ho sakein; aage org-scoped memory/limits ka base |

---

## 3. Files

### agent-service
| File | Change |
|---|---|
| `core/auth.py` (naya) | `Caller` dataclass, `verify_token()`, FastAPI dependency `get_caller()`, `resolve_user_id()`, `caller_var` |
| `main.py` | **15 endpoints** par `x_agent_secret` header + `verify_secret()` ki jagah `caller: Caller = Depends(get_caller)`. Purana `verify_secret` hataya. `improve-resume`, `job-match`, `orchestrate`, `GET/DELETE /threads` mein user ID `resolve_user_id` se |
| `core/observability.py` | `run_config` caller se user/org leta hai (trace par `user_id` + `org:` tag) |
| `requirements.txt` | `PyJWT==2.10.1` |

### Next.js
| File | Change |
|---|---|
| `lib/agentAuth.ts` (naya) | `agentHeaders(caller)`: `jose` `SignJWT` se token + (migration ke dauraan) legacy header. `AGENT_SEND_LEGACY_SECRET=false` se legacy band |
| 10 routes (`agents/*` ke 5, `auto-apply/fetch-jobs`, `job-match-agent`, `resume/improve`, `recruiter-copilot` ke 2) | `headers: await agentHeaders(session.user)`; har route ka bekaar `AGENT_SECRET` constant hataya |
| `lib/copilot-agent.ts` | `copilotUser()` ab `{id, orgId, role}` deta hai; `AGENT_SECRET` export hataya |
| `app/api/recruiter-copilot/[threadId]` | Ab `?user_id=` nahi bhejta, user token se |
| `app/api/agents/route.ts` | Public `/agents` catalogue call se secret header hataya (wahan auth tha hi nahi, bekaar mein secret bhej rahe the) |
| `package.json` | `jose` direct dependency (pehle sirf `next-auth` ke through transitive tha) |

---

## 4. Verification

**Unit tests** `tests/test_auth.py`, 13 naye tests (total **41 passed**):
- Valid token → accept, user token se (stateful thread bana)
- **Reject (401):** expired, galat key (forged), galat `aud`, galat `iss`, `alg=none`, garbage string
- **No downgrade:** galat token + sahi legacy secret → 401
- Body `user_id` ≠ token `sub` → **403**
- Thread isolation token ke through: `alice` ka thread `bob` ke token se `exists: false`
- Legacy secret migration mein chalta hai; `AGENT_ALLOW_LEGACY_SECRET=false` par band; `AGENT_SECRET` unset → sab locked

**Cross-language interop** (asli `lib/agentAuth.ts`, `tsx` se):
```
Node (jose) sign → Python (PyJWT) verify:
  Caller(via='jwt', user_id='cuid_user_123', org_id='org_9', role='recruiter') ✅
galat key → InvalidSignatureError ✅
legacy header: default on, AGENT_SEND_LEGACY_SECRET=false par off ✅
```
`npx tsc --noEmit` clean; ESLint mein sirf purane 4 warnings.

---

## 5. Deploy plan (2 phase)

| Phase | Kya karna hai | Asar |
|---|---|---|
| **1 (abhi)** | Dono services deploy karo, koi env change nahi | Next.js token + legacy header dono bhejta hai; agent-service token ko prefer karta hai. Deploy order se fark nahi padta |
| **2 (dono live hone ke baad)** | Next.js (Amplify): `AGENT_SEND_LEGACY_SECRET=false`; agent-service (Railway): `AGENT_ALLOW_LEGACY_SECRET=false` | Secret network par jaana band; sirf signed tokens accept |

---

## 6. Trade-offs aur jo baaki hai

| Point | Detail |
|---|---|
| Symmetric key (HS256) | Dono services ke paas same key hai, to agent-service bhi token bana sakta hai. Do services ke beech theek hai; zyada services hon to RS256/EdDSA (private key sirf Next.js ke paas) better |
| `jti` replay check nahi | 2 min window mein ek token dobara use ho sakta hai. Zaroorat ho to Redis mein `jti` store karke check |
| Key rotation | Abhi ek hi key. Rotation ke liye `kid` header + do keys ek saath accept karna |
| Role ka enforcement agent-service mein nahi | Role token mein aata hai, lekin permission check abhi Next.js mein hi hota hai (jaise Copilot = recruiter/admin) |
| `org_id` abhi sirf traces mein | Org-scoped memory / quotas aage ke modules mein |

---

## 7. Interview mein kaise bolna hai

> "Pehle Next.js aur Python agent-service ke beech ek shared secret header tha. Usse kaun call kar raha hai yeh pata nahi chalta tha, aur `user_id` body mein aata tha, jise bana ke koi bhi kisi ka Copilot thread padh sakta tha. Maine use **per-request signed JWT** se replace kiya: HS256, 2 minute expiry, `aud`/`iss` scoped, `sub` = user, `org` = organization. Agent-service user identity **sirf verified token se** leta hai; body ka `user_id` alag ho to 403. Algorithm pinned hai (`alg=none` reject), aur invalid token kabhi legacy secret par downgrade nahi hota. Dono services alag deploy hoti hain, isliye migration 2 phase mein hai: pehle dono auth accept, phir flags se legacy band. Python aur Node ke beech interop maine asli code se verify kiya."

**Follow-up sawaal:**
- *"JWT hi kyun, mTLS ya API gateway kyun nahi?"* mTLS service ko authenticate karta hai, **user** ko nahi. Mujhe har request ke saath user aur org identity chahiye thi, jo token claims se aati hai. Dono saath bhi lag sakte hain.
- *"HS256 vs RS256?"* Do trusted services ke liye HS256 simple aur tez hai. Agar teesri service sirf verify kare aur sign na kar sake, tab asymmetric (RS256/EdDSA) lunga.
- *"Token chori ho jaaye to?"* 2 minute expiry, ek user, ek audience. Aur chahiye to `jti` blacklist/replay cache.

---

# Module 5: Human-in-the-Loop (Approval Gates)

## 1. Problem kya tha

| # | Problem | Asar |
|---|---|---|
| 1 | Screener "reject" bolta tha to sirf `needs_human_review: true` **flag** response mein jaata tha. Graph rukta nahi tha | Flag ignore ho sakta tha; AI ka reject hi effectively final tha. Kisi ki career par asar wala decision bina insaan ke |
| 2 | Scheduler sirf slots **propose** karta tha, book ya email kuch nahi karta tha | Copilot asli kaam nahi kar sakta tha. Aur agar booking/email add karte bina approval ke, to AI candidate ko khud email bhej deta |
| 3 | Existing `interview/public/book-slot` route mein `isBooked` check aur update **atomic nahi** hain | Do log ek saath ek hi slot book kar sakte hain (race condition). **Is module mein us route ko nahi chheda**, sirf naye Copilot booking ko atomic banaya |

---

## 2. LangGraph `interrupt()`: experiment se kya pata chala

Implement karne se pehle `langgraph 0.3.34` par ek chhota probe chalaya:

| Behaviour | Design par asar |
|---|---|
| Interrupt par `ainvoke()` koi marker return **nahi** karta | Pending approval `aget_state()` snapshot ke `tasks[].interrupts` se padha jaata hai (`_pending_approval`) |
| Resume par node **shuru se dobara** chalta hai | `interrupt()` se pehle ka code side-effect free hai. Booking/email graph ke **bahar**, approval ke baad hote hain |
| Pending approval ke dauraan naya message → LangGraph **purana approval chupchaap discard** karke naya run shuru karta hai | `/orchestrate` pending approval par **409** deta hai; UI input band kar deta hai |
| `interrupt()` ko checkpointer chahiye | Gates sirf checkpointed (multi-turn) graph mein; stateless mode pehle jaisa (sirf flag) |

---

## 3. Backend

### Orchestrator graph (checkpointer ke saath)
```
resume_screening → [review_rejection] → finalize    ← AI "reject" → interrupt(confirm_rejection)
scheduling       → [approve_booking]  → finalize    ← bookable slot + candidate email → interrupt(book_interview)
```

| Gate | Kab rukta hai | Recruiter ka jawab | Result |
|---|---|---|---|
| `review_rejection` | Screening decision `reject` ho | `reject` / `maybe` / `shortlist` + note | Report mein `screeningDecision` update + `humanReview: {aiDecision, decision, note, reviewer}`. Human ne decide kiya to `needs_human_review` false. Reply: "Recruiter changed the AI's REJECT to MAYBE." |
| `approve_booking` | Proposed slots **asli `InterviewSlot` rows** hon (`calendar_source == db_slots`) **aur** candidate email ho | `approved` + `slot_id` + editable `message`, ya decline | `scheduler_result.action = {status: approved/declined, slot_id, starts_at, candidate_email, message, reviewer}` |

Generated (fake) slots ya bina email ke koi gate nahi, kyunki tab book karne ko kuch hai hi nahi.

### API (`main.py`)
| Endpoint | Kya |
|---|---|
| `POST /orchestrate` | Pending approval ho to **409**. Run gate par ruke to `status: "awaiting_approval"` + `approval` payload + prompt reply; warna `status: "completed"` |
| `POST /threads/{id}/resume` (naya) | Recruiter ka jawab. Checks: kuch pending ho (warna 409), `type` match kare (400), zaroori fields hon (400), **`slot_id` sirf offered slots mein se** ho (400; forged slot ID reject). Phir `Command(resume=answer)` se run poora; `reviewer` = token ka user |
| `GET /threads/{id}` | `pending_approval` bhi deta hai (reload par approval card wapas aaye) |
| Langfuse | Har decision par `human-approval` guardrail event + score `human_override` (1 = recruiter ne AI ki baat badli). Isse **override rate** track ho sakta hai, jo AI quality ka accha signal hai |

---

## 4. Frontend

| File | Kya |
|---|---|
| `app/api/recruiter-copilot/[threadId]/resume/route.ts` (naya) | zod discriminated union se validation. Booking approve se **pehle** check: slot free hai, future mein hai, is recruiter ke campaign ka hai (warna 409, approval record hi nahi hota). Agent run poora hone ke baad: **atomic booking** `updateMany({where: {id, isBooked: false, startsAt > now, campaign.userId}})` → `count === 1` hi success (double-booking impossible). Phir `sendHREmail` se candidate ko confirmation (recruiter ke naam aur reply-to ke saath). SMTP na ho ya email fail ho to booking rehti hai aur UI ko saaf message jaata hai |
| `app/(dashboard)/recruiter-copilot/approval-card.tsx` (naya) | **Reject gate:** reasons + red flags, note, buttons "Confirm reject" / "Change to maybe" / "Shortlist instead". **Booking gate:** slot radio list, editable email message, "Approve & send" / "Don't book" |
| `page.tsx` | `pending` state; approval ke dauraan input disabled ("Answer the approval above to continue"); reload par `pending_approval` restore; booking result chat mein ("✅ Booked for … — confirmation email sent." ya warning) |

---

## 5. Verification

**Unit tests** `tests/test_hitl.py`, 9 naye tests (total **50 passed**):
- AI reject → `awaiting_approval`; thread reopen par `pending_approval` dikhta hai
- Override (`maybe` + note) → report mein `humanReview`, `needs_human_review: false`, sahi reply
- Pending ke dauraan naya message → **409**
- Galat `type` → 400; `decision` missing → 400; kuch pending nahi → 409
- **Doosra user** kisi aur ka approval answer nahi kar sakta (uske namespace mein paused run hai hi nahi → 409)
- Booking: sirf offered slots; **forged `slot_id` → 400**; approve → `action.slot_id` + edited message; decline → "nothing was booked"
- Candidate email na ho to gate nahi lagta

**Postgres (asli local DB):** run `review_rejection` par ruka → checkpointer band kiya (restart) → naya pool → `Command(resume=shortlist)` → run poora (`next: ()`). **Pause restart ke baad bhi bacha rehta hai.**

`npx tsc --noEmit` aur ESLint (naye files) clean. **Booking + email wala Next.js route aur approval UI browser mein test nahi hue** (recruiter login aur SMTP chahiye).

---

## 6. Trade-offs aur jo baaki hai

| Point | Detail |
|---|---|
| Approval aur booking do steps hain | Agent "approved" record karta hai, phir Next.js book karta hai. Beech mein slot chala jaaye to UI "Slot was taken" dikhata hai, lekin thread history mein "Approved — booking…" reh jaata hai. Fix: booking ke baad result agent ko wapas bhejna (ek aur graph step) |
| Approval expiry nahi | Pending approval hamesha ke liye ruka reh sakta hai. Next step: X ghante baad auto-decline / reminder |
| Approvals ki list nahi | Approval sirf us conversation ke andar dikhta hai. Ek "Pending approvals" inbox (saare threads) agla UX step |
| Purana `public/book-slot` race | Wahan bhi wahi atomic `updateMany` pattern lagana chahiye (alag chhota fix) |
| Low-faithfulness FAQ | Abhi bhi sirf flag hai, gate nahi; answer read-only hai, isliye flag kaafi hai |

---

## 7. Interview mein kaise bolna hai

> "Human-in-the-loop ko maine sirf ek flag nahi rehne diya, graph sach mein rukta hai. LangGraph `interrupt()` ke saath do gates hain: AI ka 'reject' tab tak final nahi hota jab tak recruiter confirm ya override na kare, aur interview booking + candidate email bina approval ke nahi hota. Paused state Postgres checkpointer mein hoti hai, to server restart ke baad bhi approval wahin se continue hota hai. Implement karne se pehle maine framework ka behaviour probe kiya. Resume par node dobara chalta hai, isliye side effects (booking, email) graph ke bahar approval ke baad hote hain. Aur pending approval par naya message purana approval chupchaap discard kar deta, isliye API 409 deta hai. Security: recruiter sirf offered slots mein se chun sakta hai, approval token ke user se bound hai, aur booking atomic `updateMany` hai, to double-booking nahi ho sakti. Har decision Langfuse mein `human_override` score ke saath jaata hai, jisse pata chalta hai ki recruiters AI se kitni baar asehmat hote hain."

**Follow-up sawaal:**
- *"HITL kab zaroori hai?"* Jab action irreversible ho (email gaya to gaya), kisi insaan par asar ho (reject), ya external ho. Read-only answers par flag kaafi hai, gate nahi.
- *"Approval ke beech server restart ho jaaye?"* Interrupt checkpoint ke saath Postgres mein save hai. Maine restart simulate karke verify kiya ki resume kaam karta hai.
- *"Agent khud email kyun nahi bhejta approval ke baad?"* DB aur mailer Next.js mein hain, aur side effect graph node mein hota to resume par dobara chal sakta tha. Isliye agent decision record karta hai, aur execution ek jagah atomic tarike se hota hai.
