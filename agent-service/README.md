# Resume Improvement Agent — LangGraph Microservice

A Python FastAPI + LangGraph microservice that iteratively improves resumes.

## Architecture

```
Next.js → POST /api/resume/improve → FastAPI → LangGraph Agent
                                                      ↓
                                              [analyze] → [identify_gaps]
                                                              ↓
                                                         [rewrite] ←──┐
                                                              ↓        │ loop if score < 70
                                                         [score_check]─┘
                                                              ↓
                                                         [finalize] → response
```

## Setup

### 1. Create virtual environment
```bash
cd agent-service
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Create .env file
```bash
cp .env.example .env
# Fill in your API keys
```

### 4. Run the server
```bash
uvicorn main:app --reload --port 8000
```

### 5. Test it
```bash
# Health check
curl http://localhost:8000/health

# Graph structure
curl http://localhost:8000/graph-info
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | One of these | Primary LLM |
| `GROQ_API_KEY` | One of these | Fallback LLM (free) |
| `AGENT_SECRET` | Yes | Shared secret with Next.js |
| `DATABASE_URL` | Optional | If saving directly to DB |
| `NEXTJS_API_URL` | Optional | For CORS |

## API Endpoints

### POST /improve-resume
Runs the full LangGraph improvement pipeline.

**Headers:** `x-agent-secret: your-secret`

**Body:**
```json
{
  "resume_text": "...",
  "resume_id": "cuid",
  "user_id": "cuid",
  "target_role": "Senior React Developer",
  "job_description": "optional JD text",
  "max_iterations": 3
}
```

**Response:**
```json
{
  "success": true,
  "report": {
    "initialScore": 52,
    "finalScore": 74,
    "scoreImprovement": 22,
    "iterations": 2,
    "improvedSummary": "...",
    "improvedBullets": [...],
    "keywordsAdded": ["Docker", "TypeScript"],
    "titleSuggestion": "Senior Full Stack Developer",
    "quickWins": [...]
  },
  "logs": [
    "✅ Analysis complete. Initial ATS score: 52/100",
    "🔍 Identified 3 priority fixes",
    "✍️ Iteration 1: Rewrote 4 bullets",
    "📊 Score check: 52 → 68/100",
    "✍️ Iteration 2: Rewrote 3 more bullets",
    "📊 Score check: 68 → 74/100",
    "🎉 Done! Score improved from 52 → 74 (+22 points)"
  ]
}
```

## LangGraph Concepts Used

- **StateGraph** — defines the agent's state schema
- **Nodes** — individual processing steps (analyze, rewrite, etc.)
- **Edges** — connections between nodes
- **Conditional Edges** — decision points (loop or stop)
- **ainvoke** — async execution of the full graph
