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


# ═══════════════════════════════════════════════════════════════
# NEW AGENTS — 5 Advanced LangGraph Agents
# ═══════════════════════════════════════════════════════════════

from agents.interview_evaluator.graph import interview_evaluator_agent
from agents.candidate_screening.graph import candidate_screening_agent
from agents.learning_path.graph import learning_path_agent
from agents.interview_panel.graph import interview_panel_agent
from agents.market_intelligence.graph import market_intelligence_agent


# ── Agent 1: Interview Evaluator ─────────────────────────────────
class InterviewEvaluatorRequest(BaseModel):
    session_id: str
    role: str
    round_type: str = "technical"
    qa_pairs: list          # [{question, answer}]
    resume_text: Optional[str] = None


@app.post("/evaluate-interview")
async def evaluate_interview(
    request: InterviewEvaluatorRequest,
    x_agent_secret: Optional[str] = Header(None)
):
    """Dynamic interview evaluation with contradiction detection."""
    verify_secret(x_agent_secret)

    if not request.qa_pairs:
        raise HTTPException(status_code=400, detail="qa_pairs required")

    initial_state = {
        "session_id": request.session_id,
        "role": request.role,
        "round_type": request.round_type,
        "qa_pairs": request.qa_pairs,
        "resume_text": request.resume_text or "",
        "evaluated_qa": [],
        "current_idx": 0,
        "contradictions": [],
        "overall_score": 0,
        "technical_score": 0,
        "communication_score": 0,
        "confidence_score": 0,
        "strengths": [],
        "weak_areas": [],
        "improvement_roadmap": [],
        "summary": "",
        "hire_recommendation": "maybe",
        "logs": [],
    }

    final_state = await interview_evaluator_agent.ainvoke(initial_state)
    return {
        "success": True,
        "overallScore": final_state.get("overall_score", 0),
        "technicalScore": final_state.get("technical_score", 0),
        "communicationScore": final_state.get("communication_score", 0),
        "confidenceScore": final_state.get("confidence_score", 0),
        "strengths": final_state.get("strengths", []),
        "weakAreas": final_state.get("weak_areas", []),
        "improvementRoadmap": final_state.get("improvement_roadmap", []),
        "summary": final_state.get("summary", ""),
        "hireRecommendation": final_state.get("hire_recommendation", "maybe"),
        "contradictions": final_state.get("contradictions", []),
        "evaluatedQA": final_state.get("evaluated_qa", []),
        "logs": final_state.get("logs", []),
    }


# ── Agent 2: Candidate Screening ─────────────────────────────────
class CandidateScreeningRequest(BaseModel):
    resume_text: str
    job_description: str
    candidate_name: str = ""
    candidate_email: str = ""
    github_username: Optional[str] = None


@app.post("/screen-candidate")
async def screen_candidate(
    request: CandidateScreeningRequest,
    x_agent_secret: Optional[str] = Header(None)
):
    """Multi-source candidate screening with GitHub verification."""
    verify_secret(x_agent_secret)

    initial_state = {
        "resume_text": request.resume_text,
        "job_description": request.job_description,
        "candidate_name": request.candidate_name,
        "candidate_email": request.candidate_email,
        "github_username": request.github_username,
        "extracted_skills": [],
        "extracted_github": request.github_username,
        "github_repos": [],
        "github_skill_match": [],
        "jd_match_score": 0,
        "matched_skills": [],
        "missing_skills": [],
        "overall_rating": 0,
        "screening_decision": "maybe",
        "decision_reasons": [],
        "red_flags": [],
        "green_flags": [],
        "screening_report": {},
        "logs": [],
    }

    final_state = await candidate_screening_agent.ainvoke(initial_state)
    return {
        "success": True,
        "report": final_state.get("screening_report", {}),
        "logs": final_state.get("logs", []),
    }


# ── Agent 3: Learning Path ────────────────────────────────────────
class LearningPathRequest(BaseModel):
    weak_areas: list
    current_skills: list
    target_role: str
    experience_level: str = "mid"
    available_hours_per_week: int = 10


@app.post("/generate-learning-path")
async def generate_learning_path(
    request: LearningPathRequest,
    x_agent_secret: Optional[str] = Header(None)
):
    """Personalized adaptive learning path generation."""
    verify_secret(x_agent_secret)

    initial_state = {
        "weak_areas": request.weak_areas,
        "current_skills": request.current_skills,
        "target_role": request.target_role,
        "experience_level": request.experience_level,
        "available_hours_per_week": request.available_hours_per_week,
        "prioritized_topics": [],
        "current_topic_idx": 0,
        "resources_per_topic": [],
        "learning_plan": {},
        "total_weeks": 0,
        "logs": [],
    }

    final_state = await learning_path_agent.ainvoke(initial_state)
    return {
        "success": True,
        "plan": final_state.get("learning_plan", {}),
        "totalWeeks": final_state.get("total_weeks", 0),
        "logs": final_state.get("logs", []),
    }


# ── Agent 4: Interview Panel ──────────────────────────────────────
class InterviewPanelRequest(BaseModel):
    resume_text: str
    role: str
    qa_pairs: list


@app.post("/panel-interview")
async def panel_interview(
    request: InterviewPanelRequest,
    x_agent_secret: Optional[str] = Header(None)
):
    """Multi-agent panel interview evaluation (Technical + HR + Domain)."""
    verify_secret(x_agent_secret)

    initial_state = {
        "resume_text": request.resume_text,
        "role": request.role,
        "qa_pairs": request.qa_pairs,
        "technical_verdict": {},
        "hr_verdict": {},
        "domain_verdict": {},
        "panel_score": 0,
        "panel_recommendation": "hold",
        "panel_notes": [],
        "panel_report": {},
        "logs": [],
    }

    final_state = await interview_panel_agent.ainvoke(initial_state)
    return {
        "success": True,
        "report": final_state.get("panel_report", {}),
        "logs": final_state.get("logs", []),
    }


# ── Agent 5: Market Intelligence ─────────────────────────────────
class MarketIntelligenceRequest(BaseModel):
    resume_text: str
    target_role: Optional[str] = None
    location: str = "India"
    experience_years: int = 3


@app.post("/market-intelligence")
async def market_intelligence(
    request: MarketIntelligenceRequest,
    x_agent_secret: Optional[str] = Header(None)
):
    """Resume market intelligence — demand score, salary, skill gaps."""
    verify_secret(x_agent_secret)

    initial_state = {
        "resume_text": request.resume_text,
        "target_role": request.target_role,
        "location": request.location,
        "experience_years": request.experience_years,
        "current_skills": [],
        "market_demand_skills": [],
        "skill_gaps": [],
        "salary_range": {},
        "demand_score": 0,
        "market_report": {},
        "action_plan": [],
        "logs": [],
    }

    final_state = await market_intelligence_agent.ainvoke(initial_state)
    return {
        "success": True,
        "report": final_state.get("market_report", {}),
        "logs": final_state.get("logs", []),
    }


# ── Graph info for all agents ─────────────────────────────────────
@app.get("/agents")
def list_agents():
    return {
        "agents": [
            {"name": "resume-improvement",   "endpoint": "/improve-resume",        "description": "Iteratively improves resume ATS score"},
            {"name": "interview-evaluator",  "endpoint": "/evaluate-interview",    "description": "Dynamic evaluation with contradiction detection"},
            {"name": "candidate-screening",  "endpoint": "/screen-candidate",      "description": "Multi-source screening with GitHub verification"},
            {"name": "learning-path",        "endpoint": "/generate-learning-path","description": "Personalized adaptive learning plan"},
            {"name": "interview-panel",      "endpoint": "/panel-interview",       "description": "3-agent panel: Technical + HR + Domain"},
            {"name": "market-intelligence",  "endpoint": "/market-intelligence",   "description": "Salary, demand score, skill gap analysis"},
        ]
    }
