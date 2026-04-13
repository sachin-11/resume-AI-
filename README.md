# AI Resume Coach

A production-ready AI-powered resume analysis and mock interview platform built with Next.js 15, TypeScript, Tailwind CSS, and Groq AI.

## Features

- **Resume Upload & Analysis** — Upload PDF/DOCX, extract text, get AI-powered analysis with skills, strengths, ATS suggestions
- **Interview Generator** — Generate personalized questions based on your resume, role, difficulty, and round type
- **Mock Interview Mode** — Chat-based interview with AI follow-up questions
- **AI Feedback Engine** — Detailed scoring (technical, communication, confidence) with improvement roadmap
- **Dashboard** — Performance trends, stats, and quick actions
- **Settings** — Profile, target role, tech stack preferences

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui components
- **Backend**: Next.js API Routes, Prisma ORM v7
- **Database**: PostgreSQL
- **AI**: Groq SDK (llama-3.3-70b-versatile)
- **Auth**: NextAuth.js v4
- **Charts**: Recharts
- **Animations**: Framer Motion

## Setup

### 1. Prerequisites

- Node.js 18+
- PostgreSQL database (local or hosted)
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — Random secret (run `openssl rand -base64 32`)
- `NEXTAUTH_URL` — Your app URL (http://localhost:3000 for dev)
- `GROQ_API_KEY` — Your Groq API key

### 4. Setup database

```bash
npx prisma migrate dev --name init
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
ai-resume-coach/
├── app/
│   ├── (auth)/           # Login & Register pages
│   ├── (dashboard)/      # Protected app pages
│   │   ├── dashboard/
│   │   ├── upload-resume/
│   │   ├── resume-report/
│   │   ├── interview/
│   │   │   ├── setup/
│   │   │   └── session/[id]/
│   │   ├── feedback/[id]/
│   │   ├── history/
│   │   └── settings/
│   └── api/              # API routes
├── components/
│   ├── ui/               # Base UI components
│   ├── layout/           # Sidebar, layout
│   ├── dashboard/        # Dashboard charts
│   └── feedback/         # Feedback charts
├── lib/
│   ├── auth.ts           # NextAuth config
│   ├── db.ts             # Prisma client
│   ├── groq.ts           # Groq AI client
│   ├── prompts.ts        # AI prompt templates
│   ├── fileParser.ts     # PDF/DOCX parsing
│   ├── mockData.ts       # Fallback mock data
│   └── utils.ts          # Utilities
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── config.ts         # Prisma config
└── types/
    └── index.ts          # TypeScript types
```

## Without a Groq API Key

The app works without a Groq API key using realistic mock data for:
- Resume analysis
- Interview question generation
- Feedback reports

Add your key to `.env.local` to enable real AI responses.

## Database Models

- `User` — Authentication and profile
- `Resume` — Uploaded resumes with parsed text and analysis
- `InterviewSession` — Interview sessions with config
- `Question` — Generated questions per session
- `Answer` — User answers per question
- `FeedbackReport` — AI-generated feedback per session
