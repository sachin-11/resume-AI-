# AI Resume Coach — Simple Project Guide

> Yeh file interviewer ko project samjhane ke liye hai: simple language, chhote steps, real examples.
> Har section ke end mein **"🎤 Aise bolo"** hai — wahi line interview mein bol sakte ho.

---

## 1. 30-second pitch (sabse pehle yahi bolo)

> "Maine **AI Resume Coach** banaya hai — ek AI-powered hiring platform.
> **Job seekers** ke liye: resume analysis, AI mock interviews (voice + video), aur job-apply tools.
> **Recruiters** ke liye: bulk AI interviews, candidate screening, aur ek **AI Recruitment Copilot** jo chat se kaam karta hai — 'is candidate ko screen karo, achha ho to interview book karo'.
> Frontend aur main backend **Next.js** mein hai, aur AI agents ek alag **Python service (LangGraph)** mein. Database **PostgreSQL** hai, aur sab AWS + Railway par deployed hai."

---

## 2. Problem → Solution

| Problem | Solution (project mein) |
|---|---|
| Candidates ko interview practice aur honest feedback nahi milta | AI mock interview — resume ke basis par questions, har answer par feedback, score aur improvement plan |
| Recruiters ka time sau-sau resumes padhne aur first-round interviews lene mein jaata hai | Bulk AI interviews (ek link se 100 candidates), AI screening, auto-shortlist |
| AI galti kar sakta hai — galat reject, galat email | Har important decision par **insaan ka approval** (human-in-the-loop) |

---

## 3. Big picture — project kaise bana hai

```
   User (browser)
        │
        ▼
┌───────────────────┐        ┌─────────────────────────┐
│   Next.js app     │ ─────► │  Python Agent Service   │
│  (AWS Amplify)    │  JWT   │  (Railway, LangGraph)   │
│                   │        │                         │
│ • Saare pages     │        │ • AI agents             │
│ • Login, billing  │        │ • Multi-step kaam       │
│ • Interviews      │        │ • Memory, approvals     │
│ • Emails, DB save │        │ • Background jobs       │
└────────┬──────────┘        └───────────┬─────────────┘
         │                               │
         ▼                               ▼
   ┌─────────────────────────────────────────┐
   │          PostgreSQL database            │
   └─────────────────────────────────────────┘
         │                               │
         ▼                               ▼
   Groq / OpenAI (LLM)   Pinecone (resume search)   S3 (audio)   Stripe (payments)
```

**Simple samjhao:**
- **Next.js app = dukaan ka counter.** User jo bhi dekhta ya click karta hai, sab yahan hota hai. Login, interview, payment, email — sab.
- **Agent service = back office ki expert team.** Jo kaam kai steps mein hota hai aur jisme sochna padta hai (screening, multi-agent panel), woh yahan hota hai.
- **Database = register**, jisme sab likha rehta hai.

**Do service kyun?**
Next.js chhote, tez request-response ke liye best hai. AI agents ko lamba chalna padta hai, beech mein rukna padta hai (approval ke liye), yaad rakhna padta hai — iske liye Python + LangGraph best hai.

**Ek important rule:** agent service khud kuch "action" nahi karta (email, booking, DB change). Woh sirf **suggest** karta hai. Action Next.js karta hai — aur risky action se pehle insaan approve karta hai.

> 🎤 **Aise bolo:** "Do services hain — Next.js app jo UI aur saare actions sambhalta hai, aur ek Python agent service jo multi-step AI kaam karti hai. Agent sirf propose karta hai, execute Next.js karta hai."

---

## 4. Main features (simple list)

**Candidate ke liye**
1. **Resume upload** → AI skills nikalta hai, score deta hai (0–100), job description se match batata hai
2. **Mock interview** → resume ke basis par questions; 4 round types (technical, HR, behavioral, system design), 9 interviewer styles; voice se jawab de sakte ho; coding questions bhi
3. **Smart interview** → jawab kamzor ho to AI follow-up puchta hai; achha chal raha ho to questions mushkil ho jaate hain
4. **Feedback** → score, strengths, weak areas, behtar jawab ka example, improvement plan
5. **Job tools** → cover letter, JD gap analysis, live job search, learning path

**Recruiter ke liye**
1. **Campaigns** → ek role ke liye 100 candidates ko interview link bhejo; sab AI interview dete hain
2. **Proctoring** → tab switch, camera mein do chehre, copy-paste — sab detect hota hai
3. **Compare** → candidates side-by-side
4. **AI Screening** → resume vs JD + candidate ka GitHub check
5. **AI Panel** → 3 AI interviewers (Technical, HR, Domain) ek saath judge karte hain
6. **Recruitment Copilot** → chat assistant jo kai kaam ek message mein karta hai, approval lekar
7. **Bulk Resume Screening** → 50 resumes (ya ZIP) upload karo; har resume ka AI screening parallel mein, live progress ("Screening resumes (23)"); shortlist emails sirf recruiter ke select karne ke baad
8. **AI Hiring Committee** → campaign ke saare candidates (100 tak) ko AI parallel mein assess karta hai, ranked shortlist suggest karta hai; recruiter confirm karta hai

**Platform**: Login (email, Google, phone OTP), teams, Stripe billing (Free/Pro/Enterprise), admin dashboard, AI cost tracking.

---

## 5. Ek kahani se poora flow samjhao

### Kahani 1: Candidate mock interview deta hai
1. Riya resume upload karti hai → system text nikalta hai, chhote tukdon (chunks) mein todta hai aur **Pinecone** mein save karta hai (taaki baad mein search ho sake).
2. Woh "Backend, Technical, Intermediate" interview start karti hai.
3. System Pinecone se uske resume ke relevant hisse nikalta hai → AI ko deta hai → **60% questions uske resume se, 40% general**.
4. Riya bolke jawab deti hai (speech-to-text). Har jawab ke baad AI do kaam **ek saath** karta hai:
   - jawab kamzor hai? → follow-up question
   - performance kaisi hai? → difficulty upar/neeche
5. Interview khatam → AI feedback banata hai → score, strengths, roadmap.
6. Agar AI fail ho jaaye to **fake score nahi** dikhate — "Score unavailable" dikhta hai.

### Kahani 2: Recruiter Copilot se kaam karta hai (sabse important)
Recruiter likhta hai: **"Asha ko screen karo, shortlist ho to interview book karo"**

1. **Planner (AI):** message ko steps mein todta hai → `[screening, scheduling (sirf agar shortlist ho)]`
2. **Supervisor (code, AI nahi):** ek-ek step chalata hai
3. **Screening agent:** resume padhta hai, GitHub check karta hai, JD ki har requirement tick karta hai, score deta hai
4. **Decision:** score ≥ 75 → shortlist, < 50 → reject (yeh **code** decide karta hai, AI nahi)
5. **Agar reject:** system **ruk jaata hai** aur recruiter se poochta hai — "AI reject bol raha hai, confirm karo ya badlo"
6. **Agar shortlist:** scheduling agent slots dhundhta hai, email draft karta hai → phir **ruk ke** recruiter se approval leta hai
7. Recruiter "Approve" dabata hai → Next.js slot book karta hai + candidate ko email jaata hai
8. Is poore time recruiter screen par live dekhta hai: "Checking GitHub… Matching against the job… Waiting for your approval"

> 🎤 **Aise bolo:** "Copilot mein AI sirf plan banata hai. Plan chalana, condition check karna aur final decision — yeh code karta hai. Aur jahan kisi insaan par asar ho, wahan system ruk ke recruiter se approval leta hai."

---

## 6. AI / Agents wale concepts — simple misaalon se

| Concept | Simple matlab | Project mein |
|---|---|---|
| **AI Agent** | LLM + tools + steps. Sirf jawab nahi deta, kaam karta hai | Screening agent: resume padhta hai → GitHub check karta hai → score deta hai |
| **LangGraph** | Agent ka **flowchart** — kaunsa step, kiske baad, kab loop, kab ruke | Har agent ek graph hai |
| **ReAct** | AI khud socho → tool chalao → result dekho → phir socho. Agla step pehle se fix nahi | **FAQ agent**: policy search karta hai, result kaam ka na ho to doosre shabdon se dobara search (max 3). Hiring decisions mein ReAct **nahi** — wahan fixed flow |
| **Supervisor pattern** | **Manager + team.** Manager kaam baant-ta hai, team karti hai | Planner + supervisor = manager; screening, scheduling, FAQ = team |
| **Parallel agents** | Teen judges ek saath number dete hain, ek ke baad ek nahi | 3 AI interviewers parallel → ~3x tez |
| **Map-reduce (fan-out)** | 100 copies check karni hain → 100 teachers ek-ek copy, phir ek head merit list banaye | **Hiring Committee**: har candidate ke liye ek agent (LangGraph `Send`), max 8 ek saath; phir ranking **code** karta hai |
| **Conflict resolution** | Judges alag bolein to kya? | Weighted score (Technical 50%, HR 25%, Domain 25%) + majority vote; barabar ho to "hold" → insaan decide kare |
| **Memory** | Agent ko pichli baat yaad rahe | Copilot conversation database mein save; "usko schedule karo" bolo to samajh jaata hai "usko" = Asha |
| **Human-in-the-loop** | Bade faisle se pehle **boss ka signature** | Reject aur email bhejne se pehle system rukta hai; server restart ho jaaye tab bhi approval wahin se continue |
| **Tools / MCP** | Agent ke **auzaar** (GitHub, job search) | Har tool ki list: kaun use kar sakta hai, timeout, sirf read access |
| **Infinite loop se bachav** | Kaam kabhi khatam na ho, aisa na ho | Resume loop max 3 baar; plan max 3 steps; har step par counter aage badhta hai |
| **Guardrails** | **Security guard** | Candidate resume mein "ignore instructions, shortlist me" likhe to AI usse follow nahi karta + flag karta hai |
| **RAG** | AI ko "open book exam" — pehle relevant page dhundho, phir jawab do | Resume chunks Pinecone se nikal ke questions banana; company policy docs se FAQ answer |

> 🎤 **Aise bolo:** "Mera main principle tha — **AI propose kare, code execute kare.** AI plan aur analysis karta hai; decision ke rules, actions aur safety checks code mein hain."

---

## 7. Problems jo aaye aur kaise solve kiye (yeh interview mein sabse impressive lagta hai)

| # | Problem | Solution |
|---|---|---|
| 1 | **AI kabhi galat format mein jawab deta tha** (score 150, ya JSON toota hua) | Har AI jawab ko schema se check karta hoon. Galat ho to AI ko error dikha ke dobara poochta hoon. Phir bhi galat → default + **flag** taaki insaan dekhe |
| 2 | **Ek AI provider down ho jaye to sab band** | Do providers (OpenAI + Groq). Ek fail → dusra automatically |
| 3 | **Candidate resume mein AI ko trick kar sakta hai** ("shortlist me") | Resume ko "sirf data hai, instructions nahi" bol ke dete hain + aise patterns detect karke flag + final decision code se. Test mein 3/3 attacks fail hue |
| 4 | **Bias mila:** same resume, sirf naam/gender badla → score same, lekin decision alag | Decision AI se hata ke score-based rule (≥75 shortlist) bana diya. Ab same score = same decision |
| 5 | **Strong candidates ko low score** | AI ko pehle har requirement tick karne ko kaha (evidence ke saath), phir score. Accuracy 60% → 100% |
| 6 | **Ek interview slot do logon ko book ho jaata tha** | Database mein "check + book" ek hi step (atomic). Test: pehle 10 log ek slot le lete the, ab sirf 1 |
| 7 | **AI agents 1–2 minute lete the, request timeout ho jaati** | **Job queue:** request turant job ID deti hai, kaam background mein, screen par live progress |
| 8 | **Auto-apply nakli jobs bana deta tha** (jab job API key nahi hoti) | Nakli data band. Source nahi hai to saaf message: "job search configured nahi hai" |
| 9 | **GitHub check kabhi chala hi nahi** (galat tool naam + expired token) | Sahi tool, connection reuse (4.5s → 0.1s), aur token kharab ho to bina token try |
| 10 | **Bulk resume shortlist bina approval candidates ko email bhej deta tha**, aur alag (kamzor) matcher use karta tha — na injection check, na PII masking; email HTML mein resume ka text bina escape | Bulk screening ab wahi screening agent (map-reduce, guardrails, code decision) use karta hai; shortlist = **preview → recruiter select → tab email**; HTML escape |
| 11 | **FAQ sirf user ke exact shabdon se search karta tha** — "vacation" puchho, doc mein "leave" likha ho to jawab nahi milta | FAQ ko **ReAct** banaya: AI search query khud behtar likhta hai, zarurat ho to dobara search. Accuracy **40% → 100%**. Library step-limit par chupchaap "Sorry, need more steps" ko answer bana deti thi — woh bhi pakda aur roka |

> 🎤 **Aise bolo:** "Maine har feature ko asli data par test kiya, aur kai chhupe bugs pakde — jaise same score par alag decision (bias), slot double-booking, aur fake job listings. Har ek ka ab automated test hai."

---

## 8. Security aur privacy (short)

- **Login:** NextAuth (email, Google, phone OTP); har page/role ke liye permission
- **Do services ke beech:** har request par user ka signed token (2 minute valid) — koi doosre user ka data nahi dekh sakta
- **Personal data:** AI ko resume bhejne se pehle email/phone chhupa dete hain; monitoring tool (Langfuse) mein bhi content hidden
- **Rate limits:** ek user zyada requests bhejkar system ya AI quota khatam nahi kar sakta
- **GDPR:** user apna data download ya account delete kar sakta hai

---

## 9. Quality kaise ensure ki (testing)

1. **117 automatic tests** — fake AI ke saath, har PR par chalte hain (GitHub Actions). Free, fast.
2. **Evals (asli AI ke saath test):** 4 cheezein check hoti hain:
   - Planner sahi steps banata hai? (16 examples)
   - Screening sahi decision deta hai? (5 clear cases)
   - Trick karne wale resumes fail hote hain? (3 attacks)
   - **Fairness:** same resume, alag naam/gender/age → same decision?
   - **FAQ:** ReAct vs simple search — kaun zyada sahi jawab deta hai?
   Sab **100%** pass. Score gire to CI fail.
3. **Monitoring (Langfuse):** har AI call ka time, cost, steps dikhte hain.

> 🎤 **Aise bolo:** "AI ko normal unit tests se poora test nahi kar sakte, isliye maine evals banaye — asli AI ke saath, fairness aur security samet."

---

## 10. Deployment — simple steps

**Web app (Next.js) → AWS Amplify**
1. Code GitHub par push → Amplify automatically build shuru
2. `npm install` → database client generate → `npm run build`
3. Build ke baad database migrations apply (`prisma migrate deploy`)
4. Live

**Agent service (Python) → Railway**
1. Push → Railway Python install karta hai, `requirements.txt` se libraries
2. Server start (`uvicorn`)
3. Health check `/health` — fail ho to auto restart
4. Start hote hi apni tables khud bana leta hai (memory, jobs)

**Chahiye (env variables):** database URL, AI keys (OpenAI/Groq), Pinecone key, AWS keys, Stripe keys, SMTP (email), aur dono services mein same `AGENT_SECRET`.

**Local chalana:**
```bash
npm install && npx prisma migrate dev && npm run dev        # web app → localhost:3000
cd agent-service && pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8000                       # agent service → localhost:8000
```

---

## 10.5 Production mein agent ko control mein kaise rakhte hain

Har agent run ek hi function (`run_agent`) se guzarta hai, isliye saare controls ek jagah lage hain:

- **Version:** model + prompt code + tools + KB config = ek fingerprint (`GET /version`). Models `releases.json` mein dev/staging/prod ke liye pinned hain; rollback = `python -m core.release rollback prod`.
- **Limits:** har run ka timeout, step limit (loop guard), token aur $ budget; 5 baar lagatar fail ho to agent ka circuit breaker 60s ke liye band.
- **Kill switch:** admin kisi bhi agent ko `off` ya `read_only` kar sakta hai, bina deploy ke (`PUT /admin/flags/{agent}`).
- **Audit + metrics:** har tool call aur human approval ka audit log; error rate, p95 latency, cost per agent; error/cost/latency badhe to Slack alert.
- **Feedback loop:** Copilot mein 👍/👎 → thumbs-down review ke baad eval case ban jaata hai → agli baar wahi galti PR pe hi pakdi jaati hai.
- **Ops ka playbook:** `agent-service/RUNBOOK.md` (deploy, rollback, throttling, cost alarm, owner).

## 11. Interviewer ke common sawaal — short jawab

**Q: Sabse mushkil part kya tha?**
Recruitment Copilot — multi-step plan, memory, beech mein ruk ke approval lena, aur server restart ke baad bhi wahin se continue karna.

**Q: LangGraph kyun?**
Isme flowchart jaisa control milta hai — steps, loops, beech mein rukna (approval), aur state save karna. Hiring jaise sensitive kaam mein predictable flow chahiye tha.

**Q: Multi-agent kahan use kiya?**
Chaar jagah: (1) **Copilot** — supervisor pattern (manager + team), (2) **Interview Panel** — 3 judges parallel + vote, (3) **Hiring Committee** — map-reduce: har candidate ke liye ek agent parallel (`Send` API), phir code ranking, (4) **Bulk Resume Screening** — wahi map-reduce, 50 resumes par screening agent (single screening jaisa hi logic aur guardrails). Live test: 8 candidates 5.4s mein (sequential ~20s). Suspicious integrity ya injection wale candidate kabhi auto-shortlist nahi hote, chahe score sabse zyada ho.

**Q: Multi-agent kahan NAHI use karte?**
Live interview (latency), simple kaam (ek call kaafi), aur final hiring decision (code ki policy + insaan).

**Q: ReAct pattern use kiya?**
Haan, FAQ agent mein — wahan agla step data dekh ke pata chalta hai (search ka result achha nahi to dobara search). Hiring decisions (screening, reject, booking) mein jaan-boojh ke nahi, kyunki wahan predictable aur auditable flow chahiye. ReAct ko sirf allowlisted, read-only tool milta hai, max 3 searches, aur bina document ke answer allowed nahi. Eval: ReAct 100% vs single-search 40%.

**Q: Agent infinite loop mein na jaaye, kaise?**
Har loop ki limit hai (max 3), plan max 3 steps, aur counter code mein hai — AI ke haath mein nahi.

**Q: Kab insaan ka approval zaroori hai?**
Jab galti wapas na ho sake ya kisi insaan par asar pade — kisi ko reject karna, ya candidate ko email bhejna.

**Q: Agents ke beech jhagda ho to?**
Panel mein weighted average + majority vote. Barabari ho to "hold" — insaan decide karta hai.

**Q: AI galat bole to?**
Uska jawab schema se check hota hai, galat ho to dobara poochte hain, phir bhi galat ho to flag lagake insaan ko dikhate hain. Kabhi fake result nahi dikhate.

**Q: Bias kaise handle kiya?**
Fairness test banaya — same resume, sirf naam/gender/age badla. Bug mila, fix kiya: decision ab rule-based hai.

**Q: Scale kaise karoge?**
Job workers badhao ya alag server par chalao, AI provider ka paid plan, aur Redis jaisa shared rate limiter.

**Q: Aage kya improve karoge?**
Purana data auto-delete (privacy), baaki lambe features ko bhi job queue par lana, aur recruiter ke liye "pending approvals" ka ek page.

---

## 12. Interview mein kaise present karo (order)

1. **30-second pitch** (section 1)
2. **Diagram draw karo** (section 3) — 2 box + database + AI
3. **Ek kahani sunao** — Copilot wali (section 5, kahani 2), ya Hiring Committee (100 candidates parallel)
4. **Ek-do problem + solution** (section 7) — bias wala aur double-booking wala sabse strong hain
5. Sawaal aaye to **section 6 aur 11**

**Yaad rakhne wale numbers:** 34 pages · 108 API routes · 23 database tables · 12 AI agents · 138 tests · evals 100% pass · FAQ ReAct 40% → 100% · GitHub check 4.5s → 0.1s · double-booking 10 → 1
