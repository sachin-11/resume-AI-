# AI Resume Coach — Portfolio Project

## Project Title
**AI Resume Coach** — Full-Stack AI-Powered Hiring & Interview Platform

**Live URL:** https://rasuonline.in  
**GitHub:** github.com/sachin-11/resume-AI  
**Tech Stack:** Next.js 16 · Python FastAPI · LangGraph · PostgreSQL · AWS

---

## One-Line Description
> Built a production-grade SaaS platform that automates the entire hiring lifecycle using AI — serving both job seekers and recruiters with 6 autonomous LangGraph agents, RAG pipeline, real-time voice interviews, and end-to-end automation.

---

## Project Overview

AI Resume Coach is a full-stack AI hiring platform with two sides:

- **Candidate side** — Resume analysis, AI mock interviews, job application automation, personalized learning paths
- **Recruiter side** — Bulk interview campaigns, AI candidate screening with GitHub verification, auto-shortlist pipeline

---

## Key Features Built

### 1. AI Interview Engine
- Real-time voice interview with STT (Speech-to-Text) and TTS (Text-to-Speech)
- Persona-based AI interviewers (Google style, Amazon LP, Strict, Friendly, etc.)
- **3-AI Panel Interview** — Technical AI + HR AI + Domain AI simultaneously in one chat
- **Pair Programming Mode** — AI gives incomplete code stubs, candidate completes them
- **Live Code Editor** (Monaco/VS Code) with AI code review (correctness, complexity, bugs)
- **Real-time Confidence Analyzer** — detects hesitant/confident/nervous tone after each answer
- **Progressive Hint System** — 3 levels of hints with score penalty
- **Adaptive Difficulty** — AI adjusts question difficulty based on performance
- Proctoring: tab switch detection, face detection, noise detection, copy-paste monitoring
- **Video Presence Analysis** — eye contact score, body language score via OpenAI Vision

### 2. LangGraph Multi-Agent System (Python FastAPI Microservice)
Built 6 autonomous AI agents using LangGraph:

| Agent | Nodes | Special Feature |
|---|---|---|
| Resume Improvement | 5 nodes + loop | Iterates until ATS score ≥ 70 |
| Candidate Screening | 4 nodes | Live GitHub API verification |
| Learning Path | 3 nodes | Week-by-week personalized plan |
| Panel Interview | 4 nodes | 3 AI judges with consensus scoring |
| Market Intelligence | 3 nodes | Salary range + demand score |
| Interview Evaluator | 3 nodes | Contradiction detection |

### 3. Job Application Agent
- Gap analysis (resume vs JD) with match score
- Custom cover letter generation (3 tones)
- Interview prep questions with "why they ask" + "how to answer"
- Resume auto-tailor — rewrites bullets to match JD keywords
- JD URL scraper — paste URL, AI extracts job description
- Follow-up email templates (3 stages)
- Direct HR email sending via SMTP

### 4. Recruiter Features
- Bulk interview campaigns with CSV import
- Bulk resume upload (ZIP support, 50 files)
- AI Job Match — ranks all resumes against JD by fit score
- Auto-shortlist pipeline — score threshold → email + webhook + campaign invite
- Candidate comparison (side-by-side, 2-4 candidates)
- Webhook integrations (Slack, Greenhouse, Lever, Workday)

### 5. RAG Pipeline
- Pinecone vector database for semantic resume search
- OpenAI text-embedding-3-small (1536 dims) with pseudo-embedding fallback
- Context-aware question generation using retrieved resume chunks

### 6. AI Provider Strategy
- Primary: Groq (llama-3.3-70b) — free, fast
- Fallback: OpenAI (gpt-4o-mini) — auto-switch on rate limit
- Zero interview interruption — seamless mid-session provider switch
- Admin email alert on provider switch

---

## Technical Architecture

```
Frontend (Next.js 16)
    ↓ API Routes
Backend (Next.js API + Python FastAPI)
    ↓
AI Layer:
  - Groq / OpenAI (LLM)
  - Pinecone (Vector DB / RAG)
  - LangGraph (Multi-Agent)
    ↓
Database: PostgreSQL + Prisma ORM
Storage: AWS S3 (audio, files)
Auth: NextAuth.js + Google OAuth
Payments: Stripe
Deployment: AWS Amplify + Render
```

---

## Tech Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Backend | Next.js API Routes, Python FastAPI |
| AI/ML | LangGraph, LangChain, OpenAI GPT-4o-mini, Groq llama-3.3-70b |
| Vector DB | Pinecone (RAG pipeline) |
| Database | PostgreSQL, Prisma ORM |
| Auth | NextAuth.js, Google OAuth, Phone OTP (AWS SNS) |
| Storage | AWS S3 |
| Payments | Stripe (Free/Pro/Enterprise) |
| Email | Nodemailer (Gmail SMTP) |
| Deployment | AWS Amplify (Next.js) + Render (Python agent) |
| Containerization | Docker, Docker Compose |

---

## Numbers

- **50+** API endpoints
- **20+** database models
- **6** LangGraph agents with conditional edges
- **3** subscription tiers (Stripe)
- **4** ATS webhook integrations
- **6** integrity/proctoring checks
- **RAG** pipeline with Pinecone vector DB
- **Real-time** voice interview with STT/TTS
- **GDPR** compliant (data export + account deletion)

---

## Resume Bullet Points

Use these directly in your resume:

```
• Built a production-grade AI hiring SaaS platform (Next.js + Python FastAPI)
  with 6 autonomous LangGraph agents for resume improvement, candidate screening,
  and market intelligence — deployed on AWS Amplify + Render

• Implemented RAG pipeline using Pinecone vector DB and OpenAI embeddings
  for context-aware AI interview question generation

• Designed multi-agent LangGraph system with conditional loops — Resume
  Improvement Agent iterates until ATS score ≥ 70 (max 3 iterations)

• Built real-time voice interview engine with STT/TTS, 3-AI panel mode
  (Technical + HR + Domain agents), live code editor (Monaco), and
  AI confidence analyzer with tone detection

• Integrated Groq → OpenAI automatic failover with zero interview interruption
  and admin email alerts on provider switch

• Developed auto-shortlist pipeline: AI scores resumes → threshold filter →
  email candidates → fire Slack/ATS webhooks — all in one click

• Implemented Stripe billing (3 tiers), Google OAuth, phone OTP (AWS SNS),
  GDPR data export/deletion, and role-based access control
```

---

## Interview Talking Points

**"Tell me about your most complex project"**

> "I built an AI hiring platform called AI Resume Coach. The most interesting part was the LangGraph multi-agent system — I built 6 autonomous agents in Python FastAPI. The Resume Improvement Agent uses a conditional loop: it analyzes the resume, rewrites weak sections, re-scores it, and loops back if the ATS score is still below 70. The Candidate Screening Agent fetches live GitHub repos to verify if candidates actually use the skills they claim on their resume. The whole system runs on AWS Amplify for Next.js and Render for the Python microservice, with Groq as primary LLM and OpenAI as automatic fallback."

**"What's the most challenging technical problem you solved?"**

> "The AI provider failover during live interviews. If Groq hits its rate limit mid-interview, the candidate can't wait — so I built a seamless switch: Groq fails → immediately try OpenAI → if both fail, retry Groq after cooldown. The candidate never sees an error. I also built a 5-minute cooldown tracker so we don't keep hammering a failed provider."

**"How did you use LangGraph?"**

> "LangGraph is a graph-based agent framework. Each node is a function, edges define the flow, and conditional edges create decision points. For the Resume Improvement Agent: analyze → identify gaps → rewrite → score check → if score < 70 AND iterations < 3, loop back to rewrite. Otherwise finalize. The state object carries all data between nodes — resume text, scores, iteration count, logs."

---

## Skills to Add to Resume

```
Languages:    TypeScript, Python, JavaScript
Frameworks:   Next.js 16, FastAPI, LangChain, LangGraph
AI/ML:        LLMs (OpenAI, Groq), RAG, Vector Databases,
              Prompt Engineering, Multi-Agent Systems, Agentic AI
Databases:    PostgreSQL, Prisma ORM, Pinecone
Cloud:        AWS (Amplify, S3, SNS), Render
Tools:        Docker, Stripe, NextAuth.js, Nodemailer
Concepts:     Microservices, REST APIs, Webhooks, RBAC, GDPR,
              Real-time Systems, WebSockets
```
