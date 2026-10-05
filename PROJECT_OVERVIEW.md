# AI Resume Coach — Project Overview (Client Presentation)

> **Domain**: HR Tech / Career Development SaaS  
> **Live Domain**: rasuonline.in  
> **Stack**: Next.js 16 · TypeScript · PostgreSQL · Python LangGraph · AWS

---

## Kya Bana Hai? (What We Built)

Ek **complete AI-powered HR platform** jo do taraf ke logon ke liye kaam karta hai:

| User Type | Unhe Kya Milta Hai |
|-----------|-------------------|
| **Job Seeker (Candidate)** | Resume analysis, AI mock interviews, job apply assistant, auto-apply |
| **Recruiter / Company** | Bulk interview campaigns, candidate screening, analytics, ATS integration |

---

## Major Features (Module-wise)

### 1. Resume Intelligence
- PDF/DOCX upload — text extract karta hai
- AI se **ATS Score** (0–100) deta hai — kitna resume job se match karta hai
- **Skills auto-detect** karta hai (Languages, Frameworks, Databases, Cloud, Tools)
- **Resume Improvement Agent** — LangGraph se tab tak rewrite karta hai jab tak score 70+ na ho jaye
- **Bulk resume upload** (CSV/Excel se multiple resumes ek saath)

---

### 2. AI Mock Interview Engine (Core Feature)
- **Live Q&A** with AI interviewer (voice-based ya text)
- **5+ Interviewer Personas** — Friendly, Strict, Mentor, Challenger, Conversational
- **Round Types** — Technical, HR, Behavioral, System Design, DSA
- **Difficulty Levels** — Beginner / Intermediate / Advanced
- **Adaptive Difficulty** — mid-interview performance ke basis pe question hard/easy hota hai
- **Question Types** — MCQ, Free Text, Coding (Monaco Editor with starter code)
- **RAG Pipeline** — Candidate ke resume se 60% questions generate hote hain (Pinecone vector DB)
- **Follow-up Questions** — Answer ke basis pe AI intelligent follow-up puchta hai
- **Panel Interview** — 3 AI Agents ek saath (Technical Expert + HR + Domain Expert)
- **Warmup Flow** — Pehle small talk, phir interview shuru

---

### 3. Voice & Video Integration
- **Speech-to-Text (STT)** — Candidate bolke answer de sakta hai
- **Text-to-Speech (TTS)** — AI question padhke sunata hai
- **Webcam feed** — Live video during interview
- **Audio Recording** — Poora interview AWS S3 pe save hota hai
- **Playback** — Recruiter baad mein candidate ka interview sun sakta hai

---

### 4. Feedback & Scoring
- **4 Scores** — Overall, Technical, Communication, Confidence (0–100 each)
- **Grade** — Excellent / Pass / Decent / Needs Work
- **Strengths & Weak Areas** — AI identify karta hai
- **Better Answer Examples** — Weak questions ke liye improved responses
- **Improvement Roadmap** — Step-by-step action plan
- **Full Transcript** — Saare Q&A downloadable (PDF + TXT)
- **Skip/one-word penalty** — Cheating answer pe score cut hota hai

---

### 5. Proctoring & Integrity Monitoring
- **Tab Switch Detection** — Warning + log
- **Face Detection** — No face / multiple faces / looking away
- **Noise Detection** — Background noise flag
- **Copy-Paste Detection** — Clipboard activity
- **Integrity Flag** — Clean / Warning / Suspicious
- **Violation Timeline** — Chronological log of every event
- Recruiter ko dashboard pe sab dikhta hai

---

### 6. Recruiter Campaign Tools (B2B Feature)
- **Bulk Campaign Create** — Role, round, difficulty, question count set karo
- **Candidate Invite** — Email chips, ya CSV/Excel import karo
- **Branded Email Invites** — Candidate ko personalized link milti hai
- **Candidate Portal** — Candidates apne email+password se login karte hain
- **Status Tracking** — Pending → Started → Completed → Abandoned
- **Photo Capture** — Interview end pe candidate ka snapshot
- **Candidate Comparison** — 2–4 candidates side-by-side compare karo (scores + answers)
- **Recruiter Notes** — Private notes per candidate
- **Retake** — Recruiter allow kar sakta hai retake
- **CSV Export** — Saare results download karo
- **Interview Slots** — Schedule time slots

---

### 7. Job Application Assistant (Job Agent)
- JD upload karo ya job URL paste karo (Playwright se scrape hoti hai)
- AI tab ye sab generate karta hai:
  - **Gap Analysis** — Resume vs JD mein kya miss ho raha hai
  - **Cover Letter** — Company research ke saath customized
  - **Interview Questions** — Technical + Behavioral + Role-specific
  - **Application Checklist** — Priority + time estimate
  - **Resume Bullets** — JD-specific rewrite
  - **Follow-up Email** — Rejection ya scheduling ke liye
  - **Salary Negotiation Tips**
  - **LinkedIn Message**
  - **Company Research**
  - **ATS Score**

---

### 8. Auto-Apply Agent
- **JSearch API** se jobs dhundho
- Resume se auto-match score
- **Playwright bot** automatically form fill karta hai:
  - Greenhouse, Lever, Workday, Taleo, aur custom career pages
- **Application Status** — Draft → Applied → Interview → Offer → Rejected
- Screenshot captures for review
- Progress log — kaun se fields fill hue

---

### 9. Analytics Dashboard
- **Score Trend Chart** — Performance over time
- **Role-wise Average** — Bar chart by target role
- **Difficulty Analysis** — Color-coded chart
- **Campaign Pass/Fail Rate** — Per campaign stacked bar
- **Date Range Filter** — 7d / 30d / 3mo / 6mo / 1yr / custom
- **Stat Cards** — Total interviews, avg score, resumes uploaded

---

### 10. AI Chat Assistant
- Natural language se apna data query karo
- Example: "What's my average score?", "Show last 5 interviews"
- Intent detection → Dynamic Prisma query generate → Response

---

### 11. Authentication & Security
- Email + Password (bcrypt hashed)
- **Google OAuth** — One-click login
- **Phone OTP** — AWS SNS SMS-based 2FA
- **Forgot Password** — Email reset link
- Rate limiting, XSS/CSRF protection, input sanitization
- Admin-only routes

---

### 12. Team & Organization Management
- Organization create karo
- Members ko email se invite karo
- **Roles** — Admin, Recruiter, Viewer, Candidate
- Permission-based feature access

---

### 13. Billing & Subscriptions (Stripe)
| Plan | Price | Limits |
|------|-------|--------|
| **Free** | $0 | 5 interviews/month |
| **Pro** | $19/month | Unlimited + audio recording + advanced analytics |
| **Enterprise** | $99/month | Pro + team management + campaigns + custom branding |

- Stripe Checkout + Customer Portal
- Usage bar (dashboard pe remaining interviews)
- Auto-switch to backup LLM when quota hits
- Admin alert email on quota limit

---

### 14. Webhooks & ATS Integration
- Events — `interview_completed`, `shortlisted`, `score_threshold`
- Integrates with: **Slack, Greenhouse, Lever, Workday, Custom URL**
- Signed webhooks with secret key
- Auto-shortlist candidates based on score threshold

---

### 15. GDPR / Data Privacy
- **Export My Data** — Full JSON download
- **Delete Account** — Cascade delete with password confirmation

---

### 16. AI Cost Tracking & Observability (Admin-only)
> **Kyun banaya**: Admin ko ye pata hi nahi chal raha tha ki har mock interview (question generation + hints + code review + feedback scoring) mein Groq/OpenAI ka real cost kitna lag raha hai — bina is number ke free-tier limits sahi set karna, Pro/Enterprise pricing justify karna, ya "sabse zyada AI-heavy" interviews/users identify karna possible nahi tha.

- **Real token capture** — `lib/groq.ts` mein har Groq/OpenAI response se actual `prompt_tokens`/`completion_tokens` padhe jaate hain (mock/estimated nahi) aur Postgres ke naye `AiUsageLog` table mein likhe jaate hain — `feature` tag (`interview_create`, `feedback`, `hint`, `code_review`), `userId`, `sessionId` ke saath.
- **Dikhta kaha hai**:
  - `/admin` — platform-wide total cost, feature-wise breakdown, top 10 sabse costly interviews
  - Main `/dashboard` — admin ko ek extra "AI Cost (platform)" stat card dikhta hai
  - `/history` — har interview ke saamne uska apna `$cost` badge (admin-only)
- **Do cost sources, ek saath**:
  1. Apna khud ka hand-maintained pricing table (`lib/pricing.ts`) — turant kaam karta hai, koi external account nahi chahiye, lekin rates manually update karne padte hain.
  2. **Langfuse** (`lib/langfuse.ts`) — har call ka full trace (exact prompt + response + tokens) bhejta hai aur unki khud ki maintained pricing catalog se authoritative cost calculate karta hai. `agent-service` (Python) pehle se Langfuse use kar raha tha (`observability.py`), isliye same tool choose kiya taki dono services (Next.js + Python) ek hi Langfuse project mein report karein — LangSmith consider kiya tha but reject kar diya kyunki wo closed-source SaaS-only hai (candidate resume/answers jaisa sensitive data third-party pe jaata) aur is project ke Next.js side (raw Groq SDK, LangChain nahi) mein iska koi native fayda nahi milta.
  - Dono opt-in/no-op hain — `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` set na ho to kuch break nahi hota, bas Langfuse trace skip ho jaata hai.

---

## AI Architecture

```
Frontend (Next.js)
       │
       ├── Groq API (llama-3.3-70b) ← Primary LLM (free, fast)
       │       └── OpenAI (gpt-4o-mini) ← Fallback (auto-switch)
       │               └── AiUsageLog (Postgres) + Langfuse ← cost/token tracking on every call
       │
       ├── Pinecone Vector DB ← RAG for resume-based questions
       │
       └── Python FastAPI Microservice (LangGraph Agents)
               ├── Resume Improvement Agent
               ├── Candidate Screening Agent
               ├── Auto-Apply Agent
               ├── Panel Interview Agent (3 simultaneous agents)
               ├── Job Match Agent
               ├── Interview Evaluator Agent
               ├── Learning Path Agent
               └── Market Intelligence Agent
```

---

## RAG Pipeline — Detailed (Resume-based Question Generation)

> Ye pura TypeScript mein hai (`lib/rag.ts`), Python/LangGraph involved nahi hai. Groq/OpenAI ko direct call karta hai.

- **Pinecone setup** — lazy singleton client, index name `PINECONE_INDEX` env var ya default `"resume-coach"`.
- **Embeddings** — pehle OpenAI `text-embedding-3-small` (1536-dim) try hota hai. Agar `OPENAI_API_KEY` na ho to ek **deterministic hash-based pseudo-embedding** pe fallback hota hai (word-level DJB2 hash → 1536-dim bucket, L2-normalized) — ye purely semantic nahi hai, sirf Pinecone crash na ho isliye safety net hai.
- **Chunking** — resume ka **pura raw text** (koi section/bullet-aware splitting nahi) 500-word ke chunks mein, 100-word overlap ke saath, sliding window se todha jaata hai.
- **Indexing** — har chunk embed hoke Pinecone mein batches of 100 mein upsert hota hai, metadata ke saath (`resumeId`, `userId`, `chunkIndex`, text ka pehla 1000 chars). `PINECONE_API_KEY` missing ho to silently skip ho jaata hai.
- **Retrieval** — query embed karke `userId` filter ke saath top-5 chunks Pinecone se query hote hain; similarity **score > 0.3** wale hi rakhe jaate hain (client-side filter).
- **Query kya hoti hai** — resume ke content se derived nahi, balki literally `"{role} {roundType} interview questions skills experience"` — matlab retrieval role+round-type ke basis pe hota hai, resume ke exact wording pe nahi.
- **60/40 split kaise ho raha hai** — ye Pinecone retrieval count se control nahi hota, balki **prompt-level instruction** hai (`lib/prompts.ts`):
  ```js
  const resumeCount = hasResume ? Math.max(1, Math.round(count * 0.6)) : 0;
  const generalCount = count - resumeCount;
  ```
  Prompt mein do explicit sections hote hain — "generate exactly {resumeCount} RESUME-BASED questions" (labeled `source: "resume"`) aur "generate exactly {generalCount} GENERAL questions" (`source: "general"`). Ek hi Groq call mein raw resume text (pehle 2500 chars) + Pinecone se retrieved chunks + ye 60/40 instruction — sab ek saath diya jaata hai, aur LLM instruction-following se hi split honour karta hai (koi programmatic post-filter nahi hai).
- Feedback generation ke liye bhi isi tarah ka RAG context banta hai (candidate ke apne answers se top-3 chunks) — `buildFeedbackRAGContext`.

---

## LangGraph Agents — Detailed (Python `agent-service/`)

> Doc mein 8 agents likhe hain, lekin code mein actually **9 hain** — ek "Daily Ops Agent" bhi hai jo kahin documented nahi tha. Saare 8 named agents real hain, koi dead/aspirational nahi.

| # | Agent | Graph Flow (Nodes) | Key Detail |
|---|-------|---------------------|------------|
| 1 | **Resume Improvement Agent** | `analyze → identify_gaps → rewrite → score_check →(loop)→ rewrite \| finalize` | Score 70+ na ho jaye tab tak (max 3 iterations) `rewrite` pe loop karta hai. Koi external tool nahi, pure LLM JSON in/out. |
| 2 | **Interview Evaluator Agent** | `evaluate_answers → detect_contradictions → generate_holistic_score` | Har Q&A alag score hota hai, phir contradictions detect karke `-5 × count` penalty lagta hai. **Frontend se actually wired nahi hai** — real feedback flow (`app/api/feedback/generate`) isko bypass karke seedha Groq call karta hai. |
| 3 | **Candidate Screening Agent** | `extract_info → fetch_github → match_jd → build_report` | `fetch_github` real tool-use hai — pehle **GitHub MCP server** (stdio, `list_repositories_by_user`) try karta hai, fail ho to plain GitHub REST API pe fallback. Verified GitHub languages se rating boost milta hai. |
| 4 | **Auto-Apply Agent** | `search_jobs → match_and_score → tailor_resume → generate_cover_letter` | `search_jobs`: JSearch API → **Brave Search MCP** (stdio) → hardcoded mock jobs, is order mein fallback. Baaki sab parallel LLM calls. |
| 5 | **Panel Interview Agent** | `technical_eval → hr_eval → domain_eval → consensus` | 3 alag personas (Technical/HR/Domain) same transcript evaluate karte hain; weighted consensus = Technical 50% + HR 25% + Domain 25%. Code mein comment hai ki parallel banane ka plan tha but abhi sequential chalta hai. |
| 6 | **Job Match Agent** | `parse_jd → deep_match → mock_interview → salary_insight → strategy → build_report` | Sabse lamba pipeline (6 nodes) — JD parse se lekar mock interview questions, salary estimate, aur application strategy tak sab ek report mein. Koi external tool nahi. |
| 7 | **Learning Path Agent** | `analyze_gaps → generate_resources → build_plan` | `build_plan` step pure Python math hai (LLM call nahi) — `estimated_hours / hours_per_week` se week-by-week schedule banata hai. |
| 8 | **Market Intelligence Agent** | `analyze_market → estimate_salary → build_action_plan` | Naam ke bawajood koi live web search/tool nahi hai — sab LLM ke training knowledge (2024-2025 tak) pe based hai. |
| 9 | **Daily Ops Agent** *(undocumented)* | `prepare → synthesize` | Emails/Slack/Jira notes paste karo, 16 task-types mein se ek choose karo (`morning_summary`, `daily_standup`, `github_pr_review`, etc.) — LLM structured digest deta hai. Koi OAuth/live connector nahi, sirf paste-in text. |

- **Shared infra** — `agents/shared/llm.py` (`get_llm()`: OpenAI `gpt-4o-mini` agar key ho, warna Groq `llama-3.3-70b-versatile`) sab agents use karte hain. `agents/shared/mcp_client.py` ka `StdioMCPClient` sirf 2 agents use karte hain — Candidate Screening (GitHub MCP) aur Auto-Apply (Brave Search MCP). Baaki sab pure sequential LLM-only pipelines hain, koi tool/MCP/Playwright nahi.
- Har Next.js route Python service ko `AGENT_SERVICE_URL` pe call karta hai, `x-agent-secret` header se authenticated.

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| **UI Components** | shadcn/ui (Radix), Framer Motion, Recharts, Monaco Editor |
| **Backend** | Next.js API Routes (107 routes), Node.js 18+ |
| **ORM** | Prisma 5.22 |
| **Database** | PostgreSQL |
| **AI (Primary)** | Groq — llama-3.3-70b-versatile |
| **AI (Fallback)** | OpenAI — gpt-4o-mini |
| **Vector DB** | Pinecone |
| **Observability** | Langfuse (LLM tracing + cost, shared with agent-service) |
| **Agents** | Python LangGraph + FastAPI |
| **Automation** | Playwright (job scraping + auto-apply) |
| **Auth** | NextAuth.js v4 |
| **Storage** | AWS S3 (audio), AWS SNS (OTP) |
| **Email** | Nodemailer (Gmail SMTP) |
| **Payments** | Stripe |
| **Hosting** | AWS Amplify |
| **Validation** | Zod |

---

## Database Models (Key Entities)

- `User` — Auth, profile, plan, org
- `Resume` — Uploaded resume, parsed data, analysis
- `InterviewSession` — Session record, status, proctoring flags, audio
- `Question` — Interview questions (AI + custom)
- `Answer` — Candidate answers with quality/confidence scores
- `FeedbackReport` — Full scoring + strengths + roadmap
- `InterviewCampaign` — Bulk campaign config
- `CandidateInvite` — Per-candidate invite, status, photo, notes
- `JobApplication` — Job apply tracking with generated content
- `AutoApplyJob` — Auto-apply job tracking
- `Organization` + `TeamMember` — Team structure + roles
- `WebhookConfig` — Webhook endpoint config
- `QuestionBank` — Custom questions library
- `AiUsageLog` — Per-call AI token usage + cost (feature, userId, sessionId, tokens, costUsd)

---

## Key Competitive Advantages (Client Pitch Points)

1. **Dual LLM failover** — Groq (free) + OpenAI (backup) = near 100% uptime
2. **Personalized RAG** — Questions from candidate's own resume (not generic)
3. **5+ Interview Personas** — Mimics real interview styles
4. **Auto-Apply Bot** — Playwright fills any job application form
5. **Panel Interviews** — 3 AI agents simultaneously (unique feature)
6. **Full Audio Recording** — Replay any interview on S3
7. **Real-time Proctoring** — Tab, face, noise, clipboard monitoring
8. **ATS Integration** — Webhooks to Greenhouse, Lever, Workday, Slack
9. **Adaptive Difficulty** — Questions get harder/easier in real-time
10. **GDPR-ready** — Data export + account deletion built-in
11. **Enterprise Billing** — 3-tier Stripe subscription with usage enforcement
12. **107 API Routes** — Production-grade, fully functional backend

---

## Numbers at a Glance

| Metric | Count |
|--------|-------|
| Total API Routes | 107 |
| LangGraph Agents | 8 |
| Interview Personas | 5+ |
| Integrations (ATS/Tools) | Slack, Greenhouse, Lever, Workday + Custom |
| Subscription Tiers | 3 (Free / Pro / Enterprise) |
| Database Models | 18+ |
| Auth Methods | 3 (Email, Google, Phone OTP) |
| Export Formats | PDF, TXT, CSV, JSON |

---

*Last Updated: September 2026*
