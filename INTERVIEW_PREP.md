# Interview Prep — AI Resume Coach (pura project, simple bhasha mein)

> Ye file interview ki taiyari ke liye hai: project kaise samjhana hai, kaunse numbers bolne hain,
> aur interviewer ke **counter questions** ke imaandaar jawab.
> Saath mein padho: `PROJECT_GUIDE.md` (features + concepts) aur `EVALS_GUIDE.md` (testing ki detail).

**Sabse zaroori niyam:** sirf wahi bolo jo sach hai aur jo tum samjha sakte ho. Har number neeche diya hai — usse bada mat karna.

---

## 1. 30-second pitch

> "I built **AI Resume Coach**, an AI hiring platform. Candidates get resume analysis and AI mock interviews; recruiters get bulk AI interviews, AI screening and a **Recruitment Copilot** that runs multi-step work from chat — *'screen this candidate and if she's shortlisted, book an interview'* — with a human approval before anything that affects a person.
> It's a Next.js app plus a separate Python **LangGraph** agent service. The part I'm proudest of is the production side: every agent runs under budgets and timeouts, has a kill switch, and is gated by real-LLM evals in CI — including prompt-injection and fairness tests. I also added a coding-assessment agent that runs candidates' code in an **AWS Bedrock AgentCore** sandbox instead of an LLM guessing whether it's correct. Most recently I made the platform an **MCP server with its own OAuth 2.1 login**, live in production: a recruiter can connect Claude Desktop and work with their candidates from there."

**Hindi mein yaad rakhne ke liye:** hiring platform → do services → AI propose kare, code execute kare → production controls + evals → AgentCore coding agent → MCP server + OAuth (Claude Desktop se live).

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

## 6.5 MCP — Resume-AI ka apna MCP server + OAuth (production mein live)

> Poori technical detail: `MCP.md`. Yahan sirf wo hai jo interview mein bolna hai, simple bhasha mein.

### Ek line mein (pitch)
> "I made Resume-AI usable from any AI assistant. It's an MCP server with its own OAuth 2.1 login, live in production. A recruiter connects Claude Desktop, logs in and approves on a consent screen, and can then ask Claude to list candidates, read interview results, run AI screening or book an interview. Booking always needs a human confirmation. I also moved my Python agents to the official MCP client, and I found and fixed four production bugs while connecting it."

**Hindi mein yaad rakhne ke liye:** MCP server (8 tools) → apna OAuth server → Claude Desktop se live connect → agents bhi MCP client → 4 production bugs pakde, har ek ka CI test.

---

### MCP kya hai (bilkul simple)
- **MCP = AI ke liye USB port.** Ek standard tarika jisse koi bhi AI app (Claude Desktop, Claude Code, apna agent) kisi bhi system ke tools aur data use kar sake. Har AI app ke liye alag integration likhne ki zaroorat nahi.
- **Teen roles:**
  - **Host:** wo app jo user chalata hai (Claude Desktop).
  - **Client:** host ke andar ka hissa jo server se baat karta hai.
  - **Server:** humara Resume-AI (`/api/mcp`).
- **Server teen cheezein deta hai:**
  - **Tools** = kaam, jo AI model khud chalata hai: `search_candidates`, `book_interview`, …
  - **Resources** = padhne ka data: `campaign://{id}`, `candidate://{id}`, hiring policy.
  - **Prompts** = tayyar templates jo user chunta hai: "review-campaign", "interview-kit".
- **Ek hi project mein dono side banaye:**
  - **Server:** Next.js, taaki Claude jaise apps Resume-AI use karein.
  - **Client:** Python agent-service, jo GitHub aur Brave jaise MCP servers use karta hai.

---

### Poora flow — Claude Desktop connect karte waqt kya hota hai (whiteboard pe aise samjhao)
```
1. Claude  → POST /api/mcp (bina token)          → 401 + "metadata yahan hai" (WWW-Authenticate)
2. Claude  → /.well-known/oauth-protected-resource → "mera login server ye hai" (RFC 9728)
3. Claude  → /.well-known/oauth-authorization-server → endpoints, PKCE S256, CIMD support (RFC 8414)
4. Claude  → /api/oauth/authorize?client_id=<Claude ka https URL>&code_challenge=…
             server Claude ka "ID card" (CIMD document) us URL se fetch karta hai — SSRF guard ke saath
5. Browser → login (agar logged out) → consent screen: "Claude chahta hai: candidates:read" → Allow
6. Browser → wapas Claude pe ek one-time code (60 second, ek hi baar chalega)
7. Claude  → /api/oauth/token: code + code_verifier (PKCE) → access token (1 ghanta) + refresh token
8. Claude  → POST /api/mcp + Bearer token → tools/list → recruiter bolta hai → tools/call list_campaigns
9. Server  → token check (signature, issuer, audience) → scope check → sirf usi recruiter ka data → audit log
```
**Ek line mein:** "Discovery → client identity → login + consent → code → PKCE se token → har call pe token, scope aur ownership ka check."

---

### Kya banaya (asli numbers — sirf yahi bolo)
| Cheez | Detail |
|---|---|
| MCP server | `/api/mcp`, Next.js, official TypeScript SDK v2, spec **2026-07-28** (stateless) + purane clients bhi chalte hain |
| Tools | **8** — 4 read-only, 3 AI kaam (screen, rank, job result), 1 destructive (`book_interview`, hamesha confirm) |
| Resources / Prompts | 2 resource templates + 1 policy doc; 2 prompts with autocomplete |
| OAuth server | Apna — discovery, authorize, consent screen, token, register, revoke, "Connected AI apps" page |
| Scopes | `candidates:read`, `screening:run`, `interviews:write` |
| Tokens | Access token **1 ghanta**, refresh token **30 din** (har use pe naya), auth code **60 second** |
| Python client | Official MCP Python SDK `mcp==2.3.0` |
| Tests | Contract test **29 checks**, OAuth end-to-end **28 checks**, **7** client-pool tests, tool-selection eval **11 cases** |
| CI | `mcp-e2e` job: asli Postgres + Next.js, har PR pe chalta hai |
| Production | Live on AWS Amplify; **Claude Desktop se connect karke tool call chal gaya** |
| Users | **Sirf main** (koi real recruiter abhi nahi) |

---

### Concepts — har ek ka "kyun" (simple)

**MCP server side**
| Concept | Simple matlab / kyun |
|---|---|
| **Stateless (2026-07-28)** | Har request apni info khud le ke aati hai, koi session nahi. Amplify pe koi bhi instance koi bhi request le sakta hai |
| **Tool annotations** | `readOnlyHint`, `destructiveHint` — Claude ne inhi se tools ko "Read-only (7)" aur "Write (1)" mein baanta, aur booking pe "Needs approval" lagaya |
| **Structured output** | Har tool ka `outputSchema` — AI ko pakka JSON milta hai, andaaza nahi |
| **Job handle** | Ranking minutes leti hai → tool turant handle deta hai, `get_job_result` se baad mein result |
| **Progress + cancel** | Screening ke har step ka progress jaata hai; user cancel kare to turant rukta hai |
| **MRTR + elicitation** | Server beech mein "confirm karo?" poochta hai — `input_required` lautata hai, client jawab ke saath wahi call dobara bhejta hai |
| **Approval link** | Purane clients ke liye: recruiter browser mein Approve dabata hai, booking wahi hoti hai |
| **Signed requestState** | Beech ka state client ke paas ghoomta hai, isliye HMAC se sign aur user se bind — badla ya doosre user se replay nahi ho sakta |

**OAuth side (login ka system)**
| Concept | Simple matlab / kyun |
|---|---|
| **OAuth 2.1** | "Password diye bina permission dena." Claude ko kabhi recruiter ka password nahi milta, sirf ek limited token |
| **PKCE (S256)** | Claude ek secret banata hai, uska hash pehle bhejta hai, secret baad mein. Agar koi beech mein code chura le to bhi bina secret ke token nahi milega |
| **Discovery (RFC 9728 / 8414)** | Claude ko kuch configure nahi karna pada — sirf URL diya, baaki usne `.well-known` se khud dhoondh liya (screen pe "Detected" aaya) |
| **CIMD** | Client ka "ID card" ek https URL pe hota hai; `client_id` wahi URL hai. Pehle se register karne ki zaroorat nahi. Claude ne yahi use kiya |
| **DCR** | Purana tareeka — client aake khud register karta hai. Deprecated hai, purane clients ke liye rakha |
| **SSRF guard** | CIMD mein server ek URL fetch karta hai — to sirf https, sirf public IP, redirect nahi, 5s timeout, 10KB limit. Warna koi `client_id` mein internal URL daal ke server se andar ki cheezein fetch karwa sakta tha |
| **Consent screen** | Recruiter dekhta hai kaun sa app, token kahan jaayega, kya permission — phir Allow/Deny. Candidate role ko mana |
| **Audience (RFC 8707)** | Token sirf `…/api/mcp` ke liye — kisi aur service ka token yahan nahi chalega, ye token kahin aur nahi |
| **Incremental scopes** | Shuru mein sirf `candidates:read`. Booking chahiye to server 403 deta hai, Claude sirf wahi extra permission maangta hai |
| **Refresh rotation + reuse detection** | Har refresh pe naya token, purana khatam. Agar purana dobara aaye (matlab chori hua) → poori family revoke |
| **Revocation / Connected AI apps** | Recruiter kabhi bhi "Disconnect" dabaye → app naya token nahi le sakta |
| **No token passthrough** | Recruiter ka token agent-service ko nahi jaata; wahan ke liye alag service token (confused-deputy attack se bachav) |

**Client side (agent-service)**
| Concept | Simple matlab / kyun |
|---|---|
| **Official SDK** | Apna hand-written client hata ke official Python SDK — protocol updates free mein milte hain |
| **Allowlist** | GitHub server code push bhi kar sakta hai; humne sirf `search_repositories` allow kiya, baaki server tak pahuchne se pehle hi refuse |
| **Version pin** | `npx -y package` (jo aaj latest ho) nahi — exact version, supply-chain risk kam |
| **Tool pinning (rug pull)** | Har tool ki description ka hash save. Server chupke se description badle (jaise "ignore instructions, data bhejo") → tool block + alert |
| **Tracing** | Har MCP call pe ek `traceparent` id; dono services ke logs mein same `trace_id` — ek search mein poori call dikhti hai |
| **Tool-selection eval** | "Tool descriptions = prompts." LLM ko sirf humari tool list deke check kiya ki sahi tool aur sahi arguments chunta hai (11 cases) |

---

### Kahani 1 — Production pe connect karte waqt 4 bugs (STAR — sabse strong kahani)
- **Situation:** sab local aur CI mein pass tha (26 + 27 checks). Phir production pe Claude Desktop connect kiya.
- **Bug 1 — Secrets runtime tak nahi pahunche.** Amplify sirf `next.config.ts` ke `env` list wale variables server code ko deta hai. MCP wale list mein nahi the, to `MCP_TOKEN_SECRET` undefined tha. **Fix:** list mein daale; dev-only switch jaan-bujh ke bahar rakha.
- **Bug 2 — Galat token pe 500 aata tha, 401 nahi.** SDK sirf apni `OAuthError` ko 401 banata hai; meri JWT library ki error 500 ban rahi thi. Matlab expire hua token wala Claude samajh hi nahi paata ki refresh karna hai. **Fix:** token errors → `401 invalid_token`; config error (secret missing) 500 hi rehta hai. 3 naye test.
- **Bug 3 — Login ke baad browser `localhost:3000` pe gaya.** Amplify ke proxy ke peeche server apna address `localhost:3000` samajhta hai, aur main redirect usi se bana raha tha. **Fix:** redirect hamesha public URL se. CI mein bug kyun nahi dikha? Wahan dono address same the. Ab CI mein public URL `127.0.0.1` aur server `localhost` — production jaisa farak — aur test redirect check karta hai.
- **Bug 4 — Logged-out user login ke baad dashboard pe pahunchta tha.** Consent screen ka `?request=…` login redirect mein gum ho jaata tha. **Fix:** login page `callbackUrl` follow karta hai (password aur Google dono), sirf apni site ke path — open redirect nahi.
- **Result:** Claude Desktop connect hua, tool call chala. Har bug ke liye ek test ya CI change, taaki wapas na aaye.
- **Seekh (zaroor bolna):** "Green CI only proves what CI can see. My CI had the same URL everywhere and plain env vars, so it couldn't see proxy or hosting differences. Now CI deliberately runs with a public URL that differs from the server's own address."

### Kahani 2 — "Approval link" kyun bana
- **Kya hua:** test mein purane (2025) client se booking pe error — *"cannot receive server-to-client requests"*.
- **Kyun:** purane protocol mein server ko beech mein poochne ke liye session chahiye, aur hum stateless hain.
- **Kya kiya:** aise clients ko tool ek **approval link** deta hai. Recruiter apne logged-in browser mein Approve dabata hai — **booking wahi hoti hai, AI ke kehne se nahi**. Dobara poochhe to "already booked".
- **Kyun safe:** form ka jawab client deta hai (theory mein AI bhar sakta hai); approval button sirf recruiter ke browser mein hai.

### Kahani 3 — Claude ne tool hi nahi chalaya (tool descriptions = prompts)
- **Kya hua:** Claude Desktop mein poocha "mere interview campaigns kaun se hain?" → Claude ne tool nahi chalaya, apni **memory** se meri khud ki job interviews bata di.
- **Kyun:** same shabd, do matlab. Model ne context dekh ke galat source chuna. Server bilkul theek tha.
- **Kya kiya:** "Resume-AI se mere hiring campaigns" pucha → tool chala. Seekh: tool ka naam aur description hi model ka prompt hai — isliye tool-selection eval banaya, aur description ko aur saaf karna next step hai.

### Ek imaandar seekh (poochein to bolo)
> "In my first local test an email actually went out. I'd restarted the dev server with SMTP disabled, but the restart failed and the old server kept serving. It went to a reserved example.com address, so it reached no one. It taught me to verify the process I think I'm testing, and to make side effects explicit: I added an `MCP_SEND_EMAILS=false` dry-run switch, and the test asserts no email left the server."

---

### Live demo (interview mein 3 minute)
1. Claude Desktop → Settings → Connectors → Resume-AI dikhao: tools "Read-only" aur "Write" mein bate hue (annotations).
2. Chat: "Resume-AI se mere hiring campaigns list karo" → tool call dikhao.
3. "Is campaign ke candidates dikhao" → emails masked dikhao (`a***@…`) — "PII kam se kam".
4. "Pehle candidate ko slot me book karo" → confirmation aata hai → **Decline** → "kuch book nahi hua".
5. Resume-AI → Settings → **Connected AI apps** → Claude listed, **Disconnect** button dikhao.
6. Bonus: GitHub pe `mcp-e2e` CI job ka green log.

**Demo se pehle:** campaign mein data ho (kam se kam ek completed interview), aur booking sirf apne email wale test candidate pe.

---

### Kya ABHI baaki hai (yeh zaroor pata ho)
- **Real users nahi:** sirf maine use kiya hai. Usage ya impact claim mat karna.
- `subscriptions/listen` (live updates) aur tasks extension (job handle polling ki jagah) — phase 5.
- Per-client rate limit aur audit logs pe anomaly alerts — phase 7. Abhi rate limit IP pe hai (120/min).
- Production mein booking confirmation Claude Desktop ke saath abhi tak end-to-end test nahi kiya — local tests mein teeno tarike pass hain.
- MCP Registry pe publish nahi kiya (sirf `server.json` ready hai).

---

### Counter questions

**Q: MCP aur normal REST API mein kya farak hai?**
> "REST is built for a specific frontend. MCP is a standard for AI clients. The client discovers tools at runtime and gets JSON Schemas and annotations, so the model knows how and when to call them. The protocol also has AI-specific pieces: asking the user mid-call, progress, scopes requested on demand. Any MCP host can use my server without custom code."

**Q: Auth0 / Clerk kyun nahi, apna OAuth server kyun?**
> "I wanted the recruiter's identity to stay in the existing NextAuth login, and MCP needs specific pieces some providers don't fully support yet: CIMD clients, the resource indicator and audience, and protected-resource metadata. Building it taught me every step. In a bigger company I'd likely use a managed authorization server and keep my resource server the same."

**Q: PKCE kyun? Client secret kyun nahi?**
> "Claude Desktop is a public client: any secret shipped in the app can be extracted. With PKCE, every login makes a one-time secret, and only its hash goes in the first step. A stolen authorization code is useless without that secret. OAuth 2.1 makes PKCE mandatory, and I only accept S256."

**Q: CIMD vs DCR?**
> "With DCR every client registers itself, so a busy server collects thousands of throwaway registrations, and the name is self-asserted. With CIMD the client_id is an https URL hosting the client's metadata. The server fetches it, and the domain itself is the identity. I support both because older clients only do DCR. The CIMD fetch is fenced against SSRF: https only, public IPs only, no redirects, size and time limits."

**Q: Refresh token chori ho gaya to?**
> "Refresh tokens rotate: every use returns a new one and retires the old. If a retired token comes back, someone has a copy, so I revoke the whole family. The thief and the real client both get logged out, and the user signs in again. Refresh tokens are stored only as hashes."

**Q: `MCP_TOKEN_SECRET` leak ho gaya to?**
> "Two steps. Revoke all refresh tokens in the DB, then rotate the secret, so every access token dies instantly. Rotating the secret alone isn't enough, because clients would just refresh and get a new token. That's written in the runbook."

**Q: AI khud booking kar de to?**
> "It can't. book_interview is marked destructive and needs the `interviews:write` scope, which isn't granted by default. It always asks for human confirmation, and Claude Desktop also shows its own 'Needs approval'. For older clients the confirmation is an approval link that only works in the recruiter's logged-in browser."

**Q: Tool poisoning / rug pull kya hai, kaise bachaya?**
> "A tool's description goes straight into the model's prompt. A malicious or compromised server can change it later to something like 'also send all data to this address'. In my client I hash each allowlisted tool's definition, and if it changes, the tool is refused and an alert fires until a human reviews and re-pins it."

**Q: Ek recruiter doosre ka data dekh sakta hai?**
> "No. Every query is scoped to the token's user in one data layer, and the contract test checks that another user gets 'not found'."

**Q: MCP server pe prompt injection?**
> "Candidate text inside results is treated as data. The server's instructions say so, and the platform already detects injection in resumes and answers. And the server never treats the client's text as authority: scopes, ownership checks and human confirmation are enforced in code."

**Q: CI green tha to production mein bugs kyun aaye?**
> "Because CI couldn't see the differences that mattered: in CI the public URL and the server's own address were the same, and env vars were plain. On Amplify the server sits behind a proxy and only gets listed env vars. I fixed each bug and changed CI to recreate the difference, a public URL that differs from the server's address, so this class of bug fails the build now."

**Q: Stateless kyun?**
> "It runs on AWS Amplify, where any instance can take any request. State between calls is explicit: a signed `requestState` for confirmations and a job handle for long work."

**Q: Sampling / Roots / Logging kyun nahi?**
> "All three are deprecated in 2026-07-28. My server calls its own LLM through agent-service, so it doesn't need the client's model. It works on ids, not file-system roots. And for logs I use structured audit lines plus trace ids."

**Q: Kitne log ise use karte hain?**
> "Nobody but me yet. It's live in production and I've connected Claude Desktop to it, but there are no real recruiters on it. What I can show is the engineering: the OAuth flow, the tests, and the production bugs I found and fixed."

---

## 7. Mat bolna (trap)

- ❌ "Thousands of users" / "production traffic" — sach: 6 users.
- ❌ "100% fair" / "bias-free" — sach: test set pe ±2, aur ek watch list hai.
- ❌ "Maine AI tools use nahi kiye" — agar kiye hain to maano, aur bolo ki faisle tumhare the.
- ❌ "Railway pe deployed" — agent-service **Render** pe hai, frontend **AWS Amplify** pe, DB **Neon**.
- ❌ "Recruiters MCP use karte hain" / "AI apps se X% kaam hota hai" — sach: MCP production mein live hai aur Claude Desktop se connect kiya, lekin **sirf maine** use kiya hai.
- ❌ "Booking Claude Desktop se production mein test ki" — jab tak khud karke na dekho, mat bolna.
- ❌ Koi number jo is file mein nahi hai.

---

## 8. Interview se pehle 15 minute ka revision

1. Section 1 ka pitch zor se 2 baar bolo.
2. Architecture diagram ek kaagaz pe banao (section 2).
3. Teen kahaniyan (section 4) — har ek 1 minute mein.
4. Section 6 mein se ye 5 pakke karo: scale, ownership, AgentCore kyun, fairness, kamzoriyan.
4b. Section 6.5 (MCP): "MCP kya hai", **poora flow (9 steps)**, **4 production bugs wali kahani**, PKCE + CIMD ek-ek line mein, aur "kya baaki hai".
5. Code mein ek baar dekh lo: `agent-service/core/observability.py` (`run_agent`), `agent-service/agents/code_assessment/nodes.py`, `agent-service/evals/run_evals.py`.
