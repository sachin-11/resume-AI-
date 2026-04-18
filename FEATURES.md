# AI Resume Coach — Complete Feature List

## 🎯 Core Interview Engine

### Interview Session
- AI-powered live interview with real-time Q&A
- **Warmup flow** — AI greets candidate, waits for response, then starts questions
- **Multi-round support** — Technical, HR, Behavioral, System Design
- **Difficulty levels** — Beginner, Intermediate, Advanced
- **AI Interviewer Personas** — Friendly, Strict, Mentor, Challenger, etc.
- **Skip question** button — candidate can skip if stuck
- **End intent detection** — say "can we end" → AI says goodbye → auto-ends
- **Voice input (STT)** — Browser speech-to-text with auto-submit on silence
- **Voice output (TTS)** — AI reads questions aloud (Male/Female voice toggle)
- **Camera integration** — Live webcam feed during interview
- **Audio recording** — Full interview audio saved to AWS S3
- **Warmup conversation** — Small talk before questions begin
- **Enter to submit** — Shift+Enter for newline

### Question Generation
- **Resume-based questions** — 60% from resume, 40% general
- **RAG pipeline** — Pinecone vector search for personalized context
- **Custom question bank** — Add your own questions, mix with AI
- **Follow-up questions** — AI asks follow-ups based on answers
- **Persona-based style** — Questions match interviewer personality

### Feedback & Scoring
- **Multi-dimensional scores** — Overall, Technical, Communication, Confidence (0-100)
- **Grade system** — Excellent / Pass / Decent / Needs Work
- **Strengths & Weak Areas** — AI-identified from answers
- **Better Answer Examples** — Improved responses for weak questions
- **Your Responses** — All Q&A shown with actual answers
- **Improvement Roadmap** — Step-by-step action plan
- **Meaningful answer validation** — Skipped/one-word answers penalize score
- **Download PDF** — Full feedback report as styled PDF
- **Download TXT** — Plain text transcript download

---

## 📄 Resume Analysis

- **Upload PDF/DOCX** — Drag-and-drop or click to browse
- **AI Analysis** — Skills, experience, education, projects extraction
- **Resume Score** — 0-100 overall score
- **ATS Matching** — Compare resume vs job description
  - Matched keywords, missing keywords, bonus skills
  - Match percentage with recommendation
- **Skill categorization** — Languages, Frameworks, Databases, Tools, Cloud
- **Career Recommendations** — AI-generated career path suggestions
- **AI-Improved Summary** — Better professional summary
- **Delete resume** — Hover to delete, Pinecone vectors also cleaned up
- **Difficulty auto-suggest** — Resume analysis suggests interview difficulty

---

## 📊 Dashboard & Analytics

- **Score trend chart** — Performance over time (line chart)
- **Avg score by role** — Bar chart
- **Avg score by difficulty** — Color-coded bar chart
- **Campaign pass/fail rate** — Stacked bar chart per campaign
- **Top performing sessions** — Ranked with mini radar charts
- **Date range filter** — Preset (7d, 30d, 3mo, 6mo, 1yr) + custom range
- **Stat cards** — Total interviews, avg score, resumes, last activity
- **Retry on error** — Reload stats if API fails

---

## 👥 Bulk Interview Campaigns

### Campaign Management
- Create campaigns with role, difficulty, round type, question count
- Delete campaigns (with confirmation)
- Campaign status tracking (active/closed)

### Candidate Management
- **Email chip input** — Add multiple emails with comma/Enter
- **CSV/Excel import** — Bulk upload candidates from file
- **Send invite emails** — Branded HTML email with interview link
- **Link-only mode** — Generate links without sending email
- **Candidate status** — Pending, Started, Completed, Abandoned
- **Candidate photos** — Snapshot captured at interview end
- **Export CSV** — Download all candidate results

### Candidate Comparison
- Select 2-4 completed candidates
- Side-by-side score comparison (all metrics)
- Integrity check comparison
- Strengths & weak areas side-by-side
- Q&A answer comparison
- Best score highlighted with 🏆 badge

### Recruiter Tools
- **Recruiter notes** — Private notes per candidate (📝 icon)
- **Interview retake** — Allow candidate to retake (🔄 icon, new token)
- **Audio playback** — Play interview recording (🎧)
- **Bulk email** — Send feedback to all completed candidates
- **Interview slots** — Schedule time slots for candidates

---

## 🔒 Proctoring & Integrity

- **Tab switch detection** — Warns candidate, logs count
- **Face detection** — Multiple faces, no face, looking away
- **Noise detection** — Background noise flagging
- **Copy-paste detection** — Clipboard activity monitoring
- **Integrity flags** — Clean / Warning / Suspicious
- **Violation timeline** — All events logged per session
- **Recruiter view** — Tab switches, proctoring flags shown in campaign

---

## 🤖 AI Chat Assistant

- Natural language queries on your data
- Ask about interviews, scores, campaigns, candidates
- Examples:
  - "What's my average score?"
  - "Show last 5 interviews"
  - "Which role did I score highest in?"
  - "How many candidates completed the Node.js campaign?"
- Intent detection → Prisma query → Natural language answer
- Conversation history maintained

---

## 💳 Billing & Subscriptions

- **Free plan** — 5 interviews/month
- **Pro plan** — Unlimited interviews ($19/mo)
- **Enterprise plan** — Everything + team features ($99/mo)
- **Stripe integration** — Checkout, webhooks, billing portal
- **Usage tracking** — Monthly counter with reset
- **Usage bar** — Dashboard + setup page show remaining interviews
- **Limit enforcement** — API blocks when quota exceeded
- **OpenAI → Groq fallback** — Auto-switch when OpenAI quota exceeded
- **Quota alert email** — Email sent when OpenAI limit hit

---

## 🔐 Authentication & Security

### Auth
- Email + Password login/register
- Google OAuth
- Phone OTP verification (AWS SNS)
- Forgot password → email reset link
- Reset password with strength indicator
- Auto-login after registration
- Client-side form validation

### Security
- Rate limiting on all sensitive APIs
- Security headers (XSS, clickjacking, HSTS, CSP)
- Input sanitization (HTML strip)
- Auth middleware (protected routes)
- Admin-only route protection
- Error boundaries (no white screen crashes)
- Password hashing (bcrypt)

---

## 👨‍💼 Team Management

- Create organization
- Invite team members (email + temp password)
- Roles: Admin, Recruiter, Viewer
- Role-based permissions
- Change member role (dropdown)
- Remove members
- Invite email with credentials

---

## 🗄️ Data & Privacy (GDPR)

- **Export my data** — Full JSON download (profile, interviews, feedback, Q&A)
- **Delete account** — Password confirmation → cascade delete all data
- Settings page "Data & Privacy" section

---

## 🎨 UI/UX

- **Dark/Light mode toggle** — Sidebar button, localStorage saved, system preference detected
- **Mobile responsive** — Hamburger menu, drawer sidebar on mobile
- **Drag-and-drop resume upload** — Visual drop zone with animation
- **History filters** — Search, status, difficulty, round type filters
- **Pagination** — Interview history (20 per page)
- **Date range picker** — Dashboard analytics filter
- **Candidate portal** — Candidates view their own feedback
- **Candidate login** — Email + password (from invite email)

---

## 🔧 Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL + Prisma ORM |
| AI (Primary) | OpenAI gpt-4o-mini |
| AI (Fallback) | Groq llama-3.3-70b |
| Vector DB | Pinecone (RAG) |
| Auth | NextAuth.js |
| Payments | Stripe |
| Storage | AWS S3 |
| SMS/OTP | AWS SNS |
| Email | Gmail SMTP (Nodemailer) |
| Hosting | AWS Amplify |
| Domain | rasuonline.in |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| PDF | jsPDF + jspdf-autotable |

---

## 📡 APIs & Integrations

- Webhook system (Slack, Greenhouse, Lever, Workday, Custom)
- Weekly digest email (cron job)
- Interview reminder emails (cron job, 1hr before)
- Recruiter alert emails (on candidate completion)
- Score report emails (to candidates)
- AWS S3 presigned URLs for audio playback
- Pinecone vector indexing on resume upload

---

## 🛠️ Admin Dashboard

- Total users, Pro/Enterprise/Free counts
- Search users by name/email
- Change user plan (Free/Pro/Enterprise)
- Pagination (20 per page)
- Admin-only access

---

## 📱 Candidate Portal

- Login with email + password (from invite)
- View all interview history
- Score breakdown per interview
- Strengths & weak areas
- Better answer examples
- Improvement roadmap
- Aggregated roadmap across all interviews

---

*Last updated: April 2026*
