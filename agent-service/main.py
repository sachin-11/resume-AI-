"""
Resume Improvement Agent — FastAPI Server

Endpoints:
  POST /improve-resume   → Run the LangGraph agent
  GET  /health           → Health check
  GET  /graph-info       → Show graph structure (for debugging)
"""

import os
import secrets
from typing import Optional
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from agent import resume_agent, ResumeImprovementState

app = FastAPI(
    title="Resume Improvement Agent",
    description="LangGraph-powered resume improvement microservice",
    version="1.0.0"
)

# ── CORS — allow Next.js to call this ───────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("NEXTJS_API_URL", "http://localhost:3000"),
        "http://localhost:3000",
        "http://localhost:3001",
        # Production — Amplify URL
        os.getenv("AMPLIFY_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AGENT_SECRET = os.getenv("AGENT_SECRET", "dev-secret-change-in-production")


# ── Request / Response Models ────────────────────────────────────
class ImproveResumeRequest(BaseModel):
    resume_text: str
    resume_id: str
    user_id: str
    target_role: Optional[str] = None
    job_description: Optional[str] = None
    max_iterations: int = 3   # how many rewrite loops max


class ImproveResumeResponse(BaseModel):
    success: bool
    report: dict
    logs: list


# ── Auth check ───────────────────────────────────────────────────
def verify_secret(x_agent_secret: Optional[str] = Header(None)):
    if not x_agent_secret or not secrets.compare_digest(x_agent_secret, AGENT_SECRET):
        raise HTTPException(status_code=401, detail="Invalid agent secret")


# ── Routes ───────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "agent": "resume-improvement",
        "llm": "openai" if os.getenv("OPENAI_API_KEY") else "groq",
    }


@app.get("/graph-info")
def graph_info():
    """Returns the graph structure — useful for understanding the agent flow."""
    return {
        "nodes": ["analyze", "identify_gaps", "rewrite", "score_check", "finalize"],
        "flow": [
            "START → analyze",
            "analyze → identify_gaps",
            "identify_gaps → rewrite",
            "rewrite → score_check",
            "score_check → rewrite (if score < 70 AND iteration < max)",
            "score_check → finalize (if score >= 70 OR iteration >= max)",
            "finalize → END"
        ],
        "description": "Iterative resume improvement agent. Loops until ATS score >= 70 or max iterations reached."
    }


@app.post("/improve-resume", response_model=ImproveResumeResponse)
async def improve_resume(
    request: ImproveResumeRequest,
    x_agent_secret: Optional[str] = Header(None)
):
    """
    Main endpoint — runs the full LangGraph resume improvement pipeline.
    
    The agent will:
    1. Analyze the resume (ATS score, skills, weak sections)
    2. Identify specific gaps
    3. Rewrite weak sections
    4. Re-score and loop if needed (up to max_iterations)
    5. Return full improvement report
    """
    verify_secret(x_agent_secret)

    if not request.resume_text or len(request.resume_text) < 50:
        raise HTTPException(status_code=400, detail="Resume text too short")

    if not os.getenv("OPENAI_API_KEY") and not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="No AI provider configured")

    # Build initial state
    initial_state: ResumeImprovementState = {
        "resume_text":    request.resume_text,
        "resume_id":      request.resume_id,
        "user_id":        request.user_id,
        "target_role":    request.target_role,
        "job_description": request.job_description,
        "initial_score":  0,
        "current_score":  0,
        "skills":         [],
        "missing_skills": [],
        "weak_sections":  [],
        "strengths":      [],
        "improved_summary":  "",
        "improved_bullets":  [],
        "keywords_added":    [],
        "title_suggestion":  "",
        "iteration":         0,
        "max_iterations":    request.max_iterations,
        "improvement_report": {},
        "error":          None,
        "logs":           [],
    }

    try:
        # 🚀 Run the LangGraph agent
        final_state = await resume_agent.ainvoke(initial_state)

        report = final_state.get("improvement_report", {})
        logs   = final_state.get("logs", [])

        return ImproveResumeResponse(
            success=True,
            report=report,
            logs=logs,
        )

    except Exception as e:
        print(f"[AGENT ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Agent failed: {str(e)}")


# ── Run directly ─────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
