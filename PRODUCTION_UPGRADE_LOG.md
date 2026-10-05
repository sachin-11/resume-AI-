# Multi-Agent System: Production Upgrade Log

> Is file mein har module ka record hai: **kya badla, kyun badla, kaise test kiya, interview mein kaise bolna hai**.
> Har naya module isi file mein neeche add hoga.

## Roadmap (status)

| Phase | Module | Status |
|---|---|---|
| 1 | `core/`: Config + LLM Gateway + Pydantic structured output + tests | ✅ Done (Module 1) |
| 1 | `observability/`: per-node tracing, run_id, cost | ⏳ Next |
| 2 | `memory/`: Postgres checkpointer, multi-turn | ⬜ |
| 2 | `api/`: JWT + org_id (multi-tenant) | ⬜ |
| 3 | `hitl/`: interrupt() + approvals | ⬜ |
| 3 | `tools/`: registry, risk levels, MCP pool | ⬜ |
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
