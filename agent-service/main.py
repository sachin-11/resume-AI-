"""
Resume Improvement Agent — FastAPI Server

Endpoints:
  POST /improve-resume   → Run the LangGraph agent
  GET  /health           → Health check
  GET  /graph-info       → Show graph structure (for debugging)
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Literal, Optional
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langgraph.types import Command

load_dotenv()

from core import jobs, memory, tools
from core.mcp_pool import pool as mcp_pool
from core.auth import Caller, get_caller, resolve_user_id
from core.ratelimit import limited_caller
from core.observability import trace_guardrail
from core.observability import RequestIdLogFilter, flush as flush_traces, new_request_id, request_id_var, run_agent

_log_handler = logging.StreamHandler()
_log_handler.addFilter(RequestIdLogFilter())
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s [req=%(request_id)s] %(message)s",
    handlers=[_log_handler],
)

from agent import resume_agent, ResumeImprovementState

@asynccontextmanager
async def lifespan(_app):
    from agents.orchestrator.graph import build_orchestrator_agent

    # Multi-turn Recruitment Copilot: orchestrator compiled with conversation memory.
    _app.state.copilot = build_orchestrator_agent(checkpointer=await memory.open_checkpointer())

    # Build the LLM clients now: the first build imports the provider SDKs (blocking,
    # seconds), which would otherwise stall the event loop on the first request.
    from core.llm import NoLLMProviderError, get_llm
    try:
        get_llm(), get_llm(tier="fast"), get_llm(temperature=0), get_llm(temperature=0, tier="fast")
    except NoLLMProviderError:
        logging.getLogger("agent").warning("No LLM provider configured — agent endpoints will fail")

    # Background job workers share the checkpointer's Postgres pool (in-memory without it).
    pool = memory.get_pool()
    store = jobs.PostgresJobStore(pool) if pool is not None else jobs.MemoryJobStore()
    _app.state.jobs = jobs.JobRunner(store, workers=int(os.getenv("AGENT_JOB_WORKERS", "2")))
    await _app.state.jobs.start()
    yield
    await _app.state.jobs.stop()  # before the pool closes under the workers
    flush_traces()  # don't drop buffered Langfuse spans on shutdown / redeploy
    await memory.close_checkpointer()
    await mcp_pool.close_all()  # stop long-lived MCP server processes


app = FastAPI(
    lifespan=lifespan,
    title="Resume Improvement Agent",
    description="LangGraph-powered resume improvement microservice",
    version="1.0.0"
)

# ── Request ID — correlates logs, Langfuse traces and the caller ──
@app.middleware("http")
async def request_id_middleware(request, call_next):
    request_id = new_request_id(request.headers.get("x-request-id"))
    token = request_id_var.set(request_id)
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["x-request-id"] = request_id
    return response


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

AGENT_SECRET = os.getenv("AGENT_SECRET")
if not AGENT_SECRET:
    print(
        "[STARTUP WARNING] AGENT_SECRET is not set — this well-known default was "
        "previously used as a fallback (visible in source, so effectively no auth). "
        "All agent endpoints will now reject every request until AGENT_SECRET is set "
        "identically on this service and on the Next.js app (AGENT_SECRET env var)."
    )


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
    usage: dict = {}


# ── Routes ───────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "agent": "resume-improvement",
        "llm": "openai" if os.getenv("OPENAI_API_KEY") else "groq",
        "memory": memory.backend,
    }


@app.get("/tools")
def list_tools(caller: Caller = Depends(get_caller)):
    """Every tool agents can call: risk level, which agents may use it, timeout, circuit state."""
    import agents.shared.tools  # noqa: F401  (registers the tools)
    return {"tools": tools.inventory()}


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
    caller: Caller = Depends(limited_caller)
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

    user_id = resolve_user_id(caller, request.user_id)

    if not request.resume_text or len(request.resume_text) < 50:
        raise HTTPException(status_code=400, detail="Resume text too short")

    if not os.getenv("OPENAI_API_KEY") and not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="No AI provider configured")

    # Build initial state
    initial_state: ResumeImprovementState = {
        "resume_text":    request.resume_text,
        "resume_id":      request.resume_id,
        "user_id":        user_id,
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
        final_state, usage = await run_agent("improve-resume", resume_agent, initial_state, user_id=user_id)

        report = final_state.get("improvement_report", {})
        logs   = final_state.get("logs", [])

        return ImproveResumeResponse(
            success=True,
            report=report,
            logs=logs,
            usage=usage,
        )

    except Exception as e:
        print(f"[AGENT ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Agent failed: {str(e)}")


# ── Run directly ─────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


# ═══════════════════════════════════════════════════════════════
# NEW AGENTS — Advanced LangGraph Agents (+ Daily Ops)
# ═══════════════════════════════════════════════════════════════

from agents.interview_evaluator.graph import interview_evaluator_agent
from agents.candidate_screening.graph import candidate_screening_agent
from agents.learning_path.graph import learning_path_agent
from agents.interview_panel.graph import interview_panel_agent
from agents.market_intelligence.graph import market_intelligence_agent
from agents.daily_ops.graph import daily_ops_agent
from agents.job_match.graph import job_match_agent
from agents.auto_apply.graph import auto_apply_agent
from agents.orchestrator.graph import orchestrator_agent
from agents.scheduler.graph import scheduler_agent
from agents.faq.graph import faq_agent
from agents.faq.store import ingest_policy_doc


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
    caller: Caller = Depends(limited_caller)
):
    """Dynamic interview evaluation with contradiction detection."""

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

    final_state, usage = await run_agent("evaluate-interview", interview_evaluator_agent, initial_state)
    return {
        "success": True,
        "usage": usage,
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
    caller: Caller = Depends(limited_caller)
):
    """Multi-source candidate screening with GitHub verification."""

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
        "ai_fallback": False,
        "decision_reasons": [],
        "red_flags": [],
        "green_flags": [],
        "screening_report": {},
        "logs": [],
    }

    final_state, usage = await run_agent("screen-candidate", candidate_screening_agent, initial_state)
    return {
        "success": True,
        "usage": usage,
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
    caller: Caller = Depends(limited_caller)
):
    """Personalized adaptive learning path generation."""

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

    final_state, usage = await run_agent("learning-path", learning_path_agent, initial_state)
    return {
        "success": True,
        "usage": usage,
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
    caller: Caller = Depends(limited_caller)
):
    """Multi-agent panel interview evaluation (Technical + HR + Domain)."""

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

    final_state, usage = await run_agent("panel-interview", interview_panel_agent, initial_state)
    return {
        "success": True,
        "usage": usage,
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
    caller: Caller = Depends(limited_caller)
):
    """Resume market intelligence — demand score, salary, skill gaps."""

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

    final_state, usage = await run_agent("market-intelligence", market_intelligence_agent, initial_state)
    return {
        "success": True,
        "usage": usage,
        "report": final_state.get("market_report", {}),
        "logs": final_state.get("logs", []),
    }


# ── Agent 6: Daily Ops (productivity digest) ─────────────────────
class DailyOpsRequest(BaseModel):
    task_type: str = "morning_summary"
    user_context: str
    optional_focus: Optional[str] = None


@app.post("/daily-ops")
async def daily_ops(
    request: DailyOpsRequest,
    caller: Caller = Depends(limited_caller)
):
    """
    Summaries, standups, inbox digests from pasted text.
    Connectors (Gmail API, etc.) are optional; paste exports or threads here.
    """

    if not request.user_context or len(request.user_context.strip()) < 12:
        raise HTTPException(status_code=400, detail="user_context required (paste emails, notes, tickets, etc.)")

    if not os.getenv("OPENAI_API_KEY") and not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="No AI provider configured")

    initial_state = {
        "task_type": request.task_type,
        "user_context": request.user_context,
        "optional_focus": request.optional_focus or "",
        "draft_json": {},
        "report": {},
        "logs": [],
    }

    final_state, usage = await run_agent("daily-ops", daily_ops_agent, initial_state)
    return {
        "success": True,
        "usage": usage,
        "report": final_state.get("report", {}),
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
            {"name": "daily-ops",            "endpoint": "/daily-ops",             "description": "Morning brief, standup, Gmail/Slack-style digests from pasted context"},
            {"name": "job-match",            "endpoint": "/job-match-agent",       "description": "Deep JD fit analysis, mock interview, salary intel, application strategy"},
            {"name": "auto-apply",           "endpoint": "/auto-apply",             "description": "Automated pipeline for matching and applying to listings via MCP"},
            {"name": "orchestrator",         "endpoint": "/orchestrate",            "description": "Routes a free-text message to the right sub-agent: resume screening, scheduling, or FAQ"},
            {"name": "scheduler",            "endpoint": "/schedule-interview",     "description": "Proposes interview slots (Calendar MCP → InterviewSlot rows → generated) and drafts a confirmation message"},
            {"name": "faq-answerer",         "endpoint": "/faq/ask",                "description": "Answers questions from indexed company policy docs via Pinecone RAG (POST /faq/ingest to index a doc)"},
        ]
    }


# ── Agent 7: Job Match ────────────────────────────────────────────
class JobMatchRequest(BaseModel):
    resume_text: str
    job_description: str
    resume_id: str = ""
    user_id: str = ""


@app.post("/job-match-agent")
async def run_job_match(
    request: JobMatchRequest,
    caller: Caller = Depends(limited_caller)
):
    """
    Deep job match analysis agent.

    Nodes: parse_jd → deep_match → mock_interview → salary_insight → strategy → build_report

    Returns: fit score, JD intelligence, competitive gaps, mock interview Q&A,
             salary range, negotiation tip, application strategy.
    """

    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="resume_text too short")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=400, detail="job_description too short")

    user_id = resolve_user_id(caller, request.user_id or None)

    initial_state = {
        "resume_text":     request.resume_text,
        "job_description": request.job_description,
        "resume_id":       request.resume_id,
        "user_id":         user_id,
        # Node 1 outputs
        "jd_title": "", "jd_company": "",
        "jd_must_have": [], "jd_nice_to_have": [],
        "jd_responsibilities": [], "jd_red_flags": [], "jd_culture_signals": [],
        # Node 2 outputs
        "fit_score": 0, "fit_verdict": "stretch",
        "competitive_edge": [], "critical_gaps": [], "optional_gaps": [], "match_summary": "",
        # Node 3 outputs
        "mock_questions": [],
        # Node 4 outputs
        "salary_min": 0, "salary_max": 0, "salary_currency": "INR",
        "salary_factors": [], "negotiation_tip": "",
        # Node 5 outputs
        "application_strategy": "", "timing_advice": "",
        "referral_tips": [], "linkedin_tips": [],
        "application_dos": [], "application_donts": [],
        # Final
        "final_report": {},
        "logs": [],
    }

    final_state, usage = await run_agent("job-match", job_match_agent, initial_state, user_id=user_id)

    return {
        "success": True,
        "usage": usage,
        "report": final_state.get("final_report", {}),
        "logs": final_state.get("logs", []),
    }


# ── Agent 8: Auto Apply Agent (Scrapes + Matches + Cover Letters) ──
class AutoApplyRequest(BaseModel):
    resume_text: str
    target_role: str
    location: str = "India"
    min_match_score: int = 65
    limit: int = 5


@app.post("/auto-apply")
async def run_auto_apply(
    request: AutoApplyRequest,
    caller: Caller = Depends(limited_caller)
):
    """
    Automated job search, scoring, resume tailoring and cover letter pipeline.
    """

    initial_state = {
        "resume_text": request.resume_text,
        "target_role": request.target_role,
        "location": request.location,
        "min_match_score": request.min_match_score,
        "limit": request.limit,
        "found_jobs": [],
        "tailored_resumes": [],
        "cover_letters": [],
        "hr_email": None,
        "email_sent": False,
        "logged_to_sheets": False,
        "logs": [],
    }

    final_state, usage = await run_agent("auto-apply", auto_apply_agent, initial_state)

    return {
        "success": True,
        "usage": usage,
        "found_jobs": final_state.get("found_jobs", []),
        "search_status": final_state.get("search_status", "ok"),
        "search_message": final_state.get("search_message", ""),
        "tailored_resumes": final_state.get("tailored_resumes", []),
        "cover_letters": final_state.get("cover_letters", []),
        "logs": final_state.get("logs", []),
    }


# ── Orchestrator: Recruitment Copilot Router ──────────────────────
class OrchestrateRequest(BaseModel):
    user_message: str
    # Multi-turn memory: authenticate with a user token (or, legacy, send user_id)
    # and pass thread_id to continue a conversation. Without a user it runs statelessly.
    user_id: Optional[str] = None
    thread_id: Optional[str] = None
    # Context fields persist in the thread once given; omit them on later turns.
    resume_text: Optional[str] = None
    job_description: Optional[str] = None
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    github_username: Optional[str] = None
    existing_slots: Optional[list] = None   # InterviewSlot rows {id, startsAt, durationMin, isBooked}, for scheduling intent


_CONTEXT_FIELDS = ("resume_text", "job_description", "candidate_name", "candidate_email", "github_username", "existing_slots")


def _thread_or_400(user_id: Optional[str], thread_id: Optional[str]) -> str:
    try:
        return memory.thread_key(user_id or "", thread_id or "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id or thread_id")


@app.post("/orchestrate")
async def orchestrate(
    request: OrchestrateRequest,
    caller: Caller = Depends(limited_caller)
):
    """
    Central LangGraph router — classifies a free-text message and dispatches
    it to the right sub-agent (resume screener, scheduler, or FAQ answerer).

    Nodes: planner → supervisor ⇄ (resume_screening | scheduling | faq | other) → finalize

    With `user_id`, the turn is part of a persisted conversation thread (a new
    `thread_id` is minted if none is given and returned in the response).
    """

    if not request.user_message or len(request.user_message.strip()) < 3:
        raise HTTPException(status_code=400, detail="user_message required")

    turn_state = {
        "messages": [HumanMessage(content=request.user_message)],
        "user_message": request.user_message,
        # Per-turn fields are reset so nothing from the previous turn leaks into this one.
        "plan": [],
        "step_index": 0,
        "next_step": "",
        "executed_steps": [],
        "skipped_steps": [],
        "intent": "",
        "intent_reasoning": "",
        "resume_screener_result": {},
        "scheduler_result": {},
        "faq_result": {},
        "other_result": {},
        "needs_human_review": False,
        "review_reasons": [],
        "final_response": {},
    }
    # Context: only overwrite what this turn actually provides, so it carries across turns.
    for field in _CONTEXT_FIELDS:
        value = getattr(request, field)
        if value is not None:
            turn_state[field] = value

    user_id = resolve_user_id(caller, request.user_id)
    if not user_id:
        stateless = {**{f: None for f in _CONTEXT_FIELDS}, "existing_slots": [], "logs": [], **turn_state}
        final_state, usage = await run_agent("orchestrate", orchestrator_agent, stateless)
        return {
            "success": True,
            "usage": usage,
            **final_state.get("final_response", {}),
            "logs": final_state.get("logs", []),
        }

    thread_id = request.thread_id or uuid.uuid4().hex
    thread = _thread_or_400(user_id, thread_id)
    copilot = app.state.copilot

    previous = await copilot.aget_state({"configurable": {"thread_id": thread}})
    # A new message would silently discard the paused run (LangGraph starts over),
    # so the recruiter must answer the pending approval first.
    if _pending_approval(previous):
        raise HTTPException(status_code=409, detail="This conversation is waiting for your approval — approve or decline it first.")
    # `logs` is append-only across the thread; return only this turn's lines.
    logs_before = len(previous.values.get("logs", [])) if previous.values else 0
    if not previous.values:
        turn_state.setdefault("existing_slots", [])

    final_state, usage = await run_agent(
        "orchestrate", copilot, turn_state, user_id=user_id, thread=thread,
    )
    return await _turn_response(copilot, thread, thread_id, final_state, usage, logs_before)


def _pending_approval(snapshot) -> Optional[dict]:
    """The interrupt payload a paused thread is waiting on, if any."""
    for task in snapshot.tasks or ():
        for pending in task.interrupts:
            return pending.value
    return None


def _approval_prompt(approval: dict) -> str:
    if approval["type"] == "confirm_rejection":
        return (f"The screener recommends REJECTING {approval['candidate_name']} "
                f"(rating {approval.get('rating', '?')}/100). Please confirm or change the decision.")
    return f"Ready to book {approval['candidate_name']} — pick a slot and approve the confirmation email."


async def _turn_response(copilot, thread: str, thread_id: str, final_state: dict, usage: dict, logs_before: int) -> dict:
    """Response for a completed turn, or for one paused at a human-approval gate."""
    snapshot = await copilot.aget_state({"configurable": {"thread_id": thread}})
    approval = _pending_approval(snapshot)
    base = {
        "success": True,
        "thread_id": thread_id,
        "memory": memory.backend,
        "usage": usage,
        "logs": final_state.get("logs", [])[logs_before:],
    }
    if approval:
        return {
            **base,
            "status": "awaiting_approval",
            "intent": final_state.get("intent"),
            "approval": approval,
            "reply": _approval_prompt(approval),
        }
    return {
        **base,
        "status": "completed",
        **final_state.get("final_response", {}),
        "reply": final_state["messages"][-1].content if final_state.get("messages") else "",
    }


class ResumeRequest(BaseModel):
    """The recruiter's answer to a pending approval."""
    type: Literal["confirm_rejection", "book_interview"]
    user_id: Optional[str] = None
    # confirm_rejection
    decision: Optional[Literal["reject", "maybe", "shortlist"]] = None
    note: str = Field(default="", max_length=1000)
    # book_interview
    approved: Optional[bool] = None
    slot_id: Optional[str] = None
    message: str = Field(default="", max_length=3000)


@app.post("/threads/{thread_id}/resume")
async def resume_thread(thread_id: str, request: ResumeRequest, caller: Caller = Depends(limited_caller)):
    """Answer a pending human-approval gate and let the paused run finish."""
    user_id = resolve_user_id(caller, request.user_id)
    thread = _thread_or_400(user_id, thread_id)
    copilot = app.state.copilot

    previous = await copilot.aget_state({"configurable": {"thread_id": thread}})
    approval = _pending_approval(previous)
    if not approval:
        raise HTTPException(status_code=409, detail="Nothing is waiting for approval in this conversation.")
    if approval["type"] != request.type:
        raise HTTPException(status_code=400, detail=f"Pending approval is '{approval['type']}', not '{request.type}'.")

    if request.type == "confirm_rejection":
        if request.decision is None:
            raise HTTPException(status_code=400, detail="decision is required")
        answer = {"decision": request.decision, "note": request.note, "reviewer": user_id}
        override = request.decision != "reject"
    else:
        if request.approved is None:
            raise HTTPException(status_code=400, detail="approved is required")
        offered = {s["slotId"] for s in approval.get("slots", [])}
        if request.approved and request.slot_id not in offered:
            raise HTTPException(status_code=400, detail="slot_id must be one of the proposed slots")
        answer = {"approved": request.approved, "slot_id": request.slot_id, "message": request.message, "reviewer": user_id}
        override = not request.approved

    trace_guardrail(
        name="human-approval",
        input_data={"type": request.type},
        output_data=answer,
        scores={"human_override": 1.0 if override else 0.0},
    )

    logs_before = len(previous.values.get("logs", []))
    final_state, usage = await run_agent(
        "orchestrate-resume", copilot, Command(resume=answer), user_id=user_id, thread=thread,
    )
    return await _turn_response(copilot, thread, thread_id, final_state, usage, logs_before)


@app.get("/threads/{thread_id}")
async def get_thread(thread_id: str, user_id: Optional[str] = None, caller: Caller = Depends(get_caller)):
    """Conversation history of one of this user's Copilot threads."""
    thread = _thread_or_400(resolve_user_id(caller, user_id), thread_id)
    snapshot = await app.state.copilot.aget_state({"configurable": {"thread_id": thread}})
    values = snapshot.values or {}
    return {
        "thread_id": thread_id,
        "exists": bool(values),
        "messages": [
            {"role": "user" if m.type == "human" else "assistant", "content": m.content}
            for m in values.get("messages", [])
        ],
        # What context the thread remembers (flags only, not the content).
        "context": {
            "has_resume": bool(values.get("resume_text")),
            "has_job_description": bool(values.get("job_description")),
            "candidate_name": values.get("candidate_name"),
        },
        "pending_approval": _pending_approval(snapshot),
    }


@app.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user_id: Optional[str] = None, caller: Caller = Depends(get_caller)):
    """Permanently delete a Copilot thread and all its checkpoints."""
    await app.state.copilot.checkpointer.adelete_thread(_thread_or_400(resolve_user_id(caller, user_id), thread_id))
    return {"success": True}


# ── Scheduler: Interview slot proposal ─────────────────────────────
class ScheduleInterviewRequest(BaseModel):
    candidate_name: str
    candidate_email: str
    role: str
    requested_timeframe: str = ""
    timezone: str = "Asia/Kolkata"
    existing_slots: list = []   # InterviewSlot rows {id, startsAt, durationMin, isBooked}


@app.post("/schedule-interview")
async def schedule_interview(
    request: ScheduleInterviewRequest,
    caller: Caller = Depends(limited_caller)
):
    """
    Proposes interview slots and drafts a confirmation message.

    Nodes: propose_slots → draft_confirmation
    Fallback chain: Calendar MCP (opt-in) → app's InterviewSlot rows → generated business-hours slots.
    """

    initial_state = {
        "candidate_name": request.candidate_name,
        "candidate_email": request.candidate_email,
        "role": request.role,
        "requested_timeframe": request.requested_timeframe,
        "timezone": request.timezone,
        "existing_slots": request.existing_slots,
        "calendar_source": "",
        "proposed_slots": [],
        "confirmation_message": "",
        "logs": [],
    }

    final_state, usage = await run_agent("schedule-interview", scheduler_agent, initial_state)

    return {
        "success": True,
        "usage": usage,
        "calendarSource": final_state.get("calendar_source"),
        "proposedSlots": final_state.get("proposed_slots", []),
        "confirmationMessage": final_state.get("confirmation_message", ""),
        "logs": final_state.get("logs", []),
    }


# ── FAQ Answerer: company-docs RAG ─────────────────────────────────
class FAQIngestRequest(BaseModel):
    doc_id: str
    title: str
    text: str


@app.post("/faq/ingest")
async def faq_ingest(
    request: FAQIngestRequest,
    caller: Caller = Depends(limited_caller)
):
    """Chunk + embed + upsert a company policy/FAQ doc into Pinecone (namespaced via metadata type=policy_doc)."""

    if len(request.text.strip()) < 20:
        raise HTTPException(status_code=400, detail="text too short")

    result = await ingest_policy_doc(request.doc_id, request.title, request.text)
    if not result.get("success"):
        raise HTTPException(status_code=503, detail=result.get("message", "Ingestion failed"))
    return result


class FAQAskRequest(BaseModel):
    question: str


@app.post("/faq/ask")
async def faq_ask(
    request: FAQAskRequest,
    caller: Caller = Depends(limited_caller)
):
    """
    Answers a question strictly from indexed company docs (RAG over Pinecone).

    Nodes: retrieve_docs → answer_question
    """

    if not request.question or len(request.question.strip()) < 3:
        raise HTTPException(status_code=400, detail="question required")

    initial_state = {
        "question": request.question,
        "retrieved_chunks": [],
        "answer": "",
        "sources": [],
        "faithfulness": 0.0,
        "answer_relevancy": 0.0,
        "eval_reasoning": "",
        "logs": [],
    }

    final_state, usage = await run_agent("faq-ask", faq_agent, initial_state)

    return {
        "success": True,
        "usage": usage,
        "answer": final_state.get("answer", ""),
        "sources": final_state.get("sources", []),
        "faithfulness": final_state.get("faithfulness", 0.0),
        "answerRelevancy": final_state.get("answer_relevancy", 0.0),
        "logs": final_state.get("logs", []),
    }


# ═══════════════════════════════════════════════════════════════
# Background jobs — long agent runs without holding a request open
# ═══════════════════════════════════════════════════════════════
# The endpoint functions double as job handlers: handler(request=<model>, caller=Caller).
jobs.register("screen-candidate", CandidateScreeningRequest, screen_candidate)
jobs.register("panel-interview", InterviewPanelRequest, panel_interview)
jobs.register("orchestrate", OrchestrateRequest, orchestrate)


class JobSubmitRequest(BaseModel):
    agent: str
    input: dict
    # Same key from the same user → the existing job is returned (double-click / retry safe).
    idempotency_key: Optional[str] = Field(default=None, max_length=100)


@app.post("/jobs", status_code=202)
async def submit_job(body: JobSubmitRequest, caller: Caller = Depends(limited_caller)):
    """Queue an agent run; poll GET /jobs/{id} for progress and the result."""
    request_model = jobs.validate_input(body.agent, body.input)
    job, created = await app.state.jobs.store.create(
        agent=body.agent,
        payload=request_model.model_dump(mode="json"),
        caller=caller,
        request_id=request_id_var.get(),
        idempotency_key=body.idempotency_key,
    )
    return {"job_id": job["id"], "status": job["status"], "created": created}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str, caller: Caller = Depends(get_caller)):
    """Status, node-by-node progress, and (when done) the result or error."""
    job = await app.state.jobs.store.get(job_id)
    if not jobs.owns(job, caller):
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs.public_view(job)


@app.post("/jobs/{job_id}/ack-usage")
async def ack_job_usage(job_id: str, caller: Caller = Depends(get_caller)):
    """Hand a finished job's token usage to the caller exactly once (for cost logging)."""
    job = await app.state.jobs.store.get(job_id)
    if not jobs.owns(job, caller):
        raise HTTPException(status_code=404, detail="Job not found")
    first = await app.state.jobs.store.ack_usage(job_id)
    return {"first": first, "usage": (job.get("result") or {}).get("usage") if first else None}
