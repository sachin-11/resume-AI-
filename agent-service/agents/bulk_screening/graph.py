"""
Bulk Resume Screening — map-reduce over the candidate screening agent

[START] ─(Send × N)─► [screen_resume]  (one branch per resume, in parallel)
                             │  each branch appends to `results`
                             ▼
                          [collect] → [END]

Each branch runs the same steps as the single-candidate screening agent
(extract → GitHub (optional) → requirement-by-requirement JD match → report),
so bulk and one-off screening share one decision policy and the same
guardrails (fenced resume, masked contact details, injection detection,
protected-attribute removal). The steps are called directly rather than as a
nested graph so live progress can count branches ("Screening resumes (23)").
"""
import operator
from typing import Annotated, List, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from agents.candidate_screening.nodes import (
    build_screening_report,
    extract_candidate_info,
    fetch_github_data,
    match_against_jd,
)


class BulkScreeningState(TypedDict, total=False):
    job_description: str
    verify_github: bool
    reference_id: str
    resumes: List[dict]                               # [{id, text}]
    results: Annotated[List[dict], operator.add]      # one per resume, any order
    report: dict
    logs: Annotated[List[str], operator.add]


def review_reasons(report: dict) -> list[str]:
    guard = report.get("guardrails") or {}
    reasons = []
    if report.get("aiFallback"):
        reasons.append("AI screening unavailable — default score, not an AI judgement")
    if guard.get("injectionSignals"):
        reasons.append(f"Possible prompt injection in the resume ({', '.join(guard['injectionSignals'])})")
    if guard.get("protectedAttributeMentionsRemoved"):
        reasons.append("AI remark cited a protected attribute (removed)")
    return reasons


async def screen_resume(task: dict) -> dict:
    state = {
        "resume_text": task["text"],
        "job_description": task["job_description"],
        "candidate_name": "",
        "candidate_email": "",
        "github_username": None,
        "skip_github": not task.get("verify_github", False),
        "logs": [],
    }
    for step in (extract_candidate_info, fetch_github_data, match_against_jd):
        state.update(await step(state))
    report = build_screening_report(state)["screening_report"]

    result = {
        "resume_id": task["id"],
        "rating": report["overallRating"],
        "decision": report["screeningDecision"],
        "matched_skills": report["matchedSkills"],
        "missing_skills": report["missingSkills"],
        "reasons": report["decisionReasons"],
        "red_flags": report["redFlags"],
        "requirement_checks": report.get("requirementChecks", []),
        "review_reasons": review_reasons(report),
    }
    return {"results": [result], "logs": [f"📄 Screened …{task['id'][-6:]}: {result['rating']} {result['decision']}"]}


def fan_out(state: BulkScreeningState):
    resumes = state.get("resumes") or []
    if not resumes:
        return "collect"
    return [
        Send("screen_resume", {**r, "job_description": state.get("job_description", ""),
                               "verify_github": state.get("verify_github", False)})
        for r in resumes
    ]


def collect(state: BulkScreeningState) -> dict:
    by_id = {r["resume_id"]: r for r in state.get("results", [])}
    ranked = sorted(by_id.values(), key=lambda r: (-r["rating"], r["resume_id"]))
    return {
        "report": {
            "reference_id": state.get("reference_id", ""),
            "total": len(ranked),
            "needs_review": sum(1 for r in ranked if r["review_reasons"]),
            "results": ranked,
        },
        "logs": [f"🏁 Screened {len(ranked)} resume(s)"],
    }


def build_bulk_screening_agent():
    workflow = StateGraph(BulkScreeningState)
    workflow.add_node("screen_resume", screen_resume)
    workflow.add_node("collect", collect)
    workflow.add_conditional_edges(START, fan_out, ["screen_resume", "collect"])
    workflow.add_edge("screen_resume", "collect")
    workflow.add_edge("collect", END)
    return workflow.compile()


bulk_screening_agent = build_bulk_screening_agent()
