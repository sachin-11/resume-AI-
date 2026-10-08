"""
Hiring Committee Agent — Nodes

assess_candidate: one LLM assessment per candidate (run in parallel). The model
  sees the role, the JD, the platform's interview scores and the candidate's own
  answers (fenced as untrusted) — never the candidate's name or email.
rank_candidates: deterministic. Composite score + explicit rules decide the
  shortlist; candidates with integrity or data problems are never auto-shortlisted,
  they go to "needs review". The recruiter confirms the final list.
"""
from pydantic import BaseModel, Field

from core.guardrails import (
    FAIRNESS_RULE, UNTRUSTED_NOTE, detect_injection, redact_contact_info, strip_protected, wrap_untrusted,
)
from core.llm import ainvoke_structured
from core.types import Score, StrList

INTERVIEW_WEIGHT = 0.6
FIT_WEIGHT = 0.4
MAX_ANSWERS = 8

POLICY = ("composite = 60% interview score + 40% committee fit score; candidates with a suspicious "
          "integrity flag, an unavailable score, an AI fallback, possible prompt injection or a "
          "protected-attribute remark are never auto-shortlisted — they need a recruiter's review.")


class CandidateAssessment(BaseModel):
    fit_score: Score
    strengths: StrList = []
    concerns: StrList = []
    summary: str = Field(default="", max_length=500)


async def assess_candidate(task: dict) -> dict:
    """One committee member's assessment of one candidate (a parallel Send branch)."""
    c = task["candidate"]
    answers = "\n\n".join(
        f"Q: {qa.get('question', '')}\nA: {qa.get('answer', '')}" for qa in c.get("answers", [])[:MAX_ANSWERS]
    )
    signals = detect_injection(answers)

    prompt = f"""You are on a hiring committee for the role: {task['role']}.
Assess how well this candidate fits the role, based on their interview. Return ONLY valid JSON:
{{
  "fit_score": 72,
  "strengths": ["Explained database indexing trade-offs with a concrete example"],
  "concerns": ["Vague on system design scaling questions"],
  "summary": "one or two sentences a recruiter can act on"
}}

fit_score rubric (fit for THIS role, not general ability):
- 85-100: answers show every core skill the role needs, with depth and concrete examples
- 70-84:  solid on the core skills; minor gaps
- 50-69:  some core skills shown; gaps a hiring manager would need to probe
- 0-49:   core skills for this role are missing or the answers are mostly empty

{FAIRNESS_RULE}
{UNTRUSTED_NOTE}

Job description: {(task.get('job_description') or '(not provided — judge against the role title)')[:1500]}

Interview results from the platform: overall {c.get('overall_score')}/100, technical {c.get('technical_score')},
communication {c.get('communication_score')}, confidence {c.get('confidence_score')}.
Platform feedback summary: {str(c.get('summary', ''))[:600]}
Platform-noted strengths: {c.get('strengths', [])[:6]}  ·  weak areas: {c.get('weak_areas', [])[:6]}

{wrap_untrusted("answers", redact_contact_info(answers)[:4000])}"""

    result = await ainvoke_structured(
        prompt,
        CandidateAssessment,
        fallback=CandidateAssessment(fit_score=0, summary="Committee assessment unavailable — review manually."),
        temperature=0,
        name="committee.assess",
    )
    a = result.data
    strengths, removed_s = strip_protected(a.strengths)
    concerns, removed_c = strip_protected(a.concerns)

    assessment = {
        "id": c["id"],
        "name": c.get("name", ""),
        "overall_score": c.get("overall_score", 0),
        "technical_score": c.get("technical_score", 0),
        "fit_score": a.fit_score,
        "strengths": strengths,
        "concerns": concerns,
        "summary": a.summary,
        "integrity_flag": c.get("integrity_flag", "clean"),
        "tab_switch_count": c.get("tab_switch_count", 0),
        "feedback_is_fallback": c.get("feedback_is_fallback", False),
        "ai_fallback": result.fallback_used,
        "injection_signals": signals,
        "protected_removed": removed_s + removed_c,
    }
    return {
        "assessments": [assessment],
        "logs": [f"🧑‍⚖️ Assessed candidate …{c['id'][-6:]}: fit {a.fit_score}"
                 + (" (⚠️ AI fallback)" if result.fallback_used else "")],
    }


def review_reasons(a: dict) -> list[str]:
    reasons = []
    if a["integrity_flag"] == "suspicious":
        reasons.append("Suspicious proctoring integrity")
    if a["feedback_is_fallback"]:
        reasons.append("Interview score unavailable (feedback fallback)")
    if a["ai_fallback"]:
        reasons.append("Committee assessment unavailable (AI fallback)")
    if a["injection_signals"]:
        reasons.append(f"Possible prompt injection in answers ({', '.join(a['injection_signals'])})")
    if a["protected_removed"]:
        reasons.append("AI remark cited a protected attribute (removed)")
    return reasons


def composite(a: dict) -> int:
    return round(INTERVIEW_WEIGHT * a["overall_score"] + FIT_WEIGHT * a["fit_score"])


def rank_candidates(state: dict) -> dict:
    """Rules, not an LLM, turn assessments into the shortlist."""
    size = state.get("shortlist_size", 5)
    by_id = {a["id"]: a for a in state.get("assessments", [])}   # one per candidate, order-independent

    eligible, needs_review = [], []
    for a in by_id.values():
        item = {**a, "composite": composite(a), "review_reasons": review_reasons(a),
                "flags": ["integrity warning"] if a["integrity_flag"] == "warning" else []}
        (needs_review if item["review_reasons"] else eligible).append(item)

    # Highest composite first; technical score, then id, break ties so reruns are stable.
    eligible.sort(key=lambda a: (-a["composite"], -a["technical_score"], a["id"]))
    needs_review.sort(key=lambda a: (-a["composite"], a["id"]))
    for rank, a in enumerate(eligible, start=1):
        a["rank"] = rank

    report = {
        "role": state.get("role", ""),
        "total": len(by_id),
        "shortlistSize": size,
        "shortlist": eligible[:size],
        "others": eligible[size:],
        "needsReview": needs_review,
        "policy": POLICY,
    }
    return {
        "report": report,
        "logs": [f"🏛️ Committee ranked {len(by_id)} candidate(s): shortlist {len(report['shortlist'])}, "
                 f"needs review {len(needs_review)}"],
    }
