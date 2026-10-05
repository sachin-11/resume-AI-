"""
Multi-Agent Interview Panel — Graph

3 AI agents simultaneously evaluate the candidate:
  - Technical Agent
  - HR Agent  
  - Domain Expert Agent

Then consensus score is generated.

[START] → [technical_eval] ─┐
          [hr_eval]         ├→ [consensus] → [END]
          [domain_eval]     ─┘
"""
from langgraph.graph import START, StateGraph, END
from typing import TypedDict, List, Literal, Optional, Annotated
import operator
from pydantic import BaseModel
from core.guardrails import (
    FAIRNESS_RULE, UNTRUSTED_NOTE, detect_injection, protected_attributes_in, redact_contact_info,
    strip_protected, wrap_untrusted,
)
from core.llm import ainvoke_structured
from core.types import Score, StrList

Verdict = Literal["strong_pass", "pass", "borderline", "fail"]


class TechnicalVerdict(BaseModel):
    technical_score: Score
    code_quality_assessment: str = ""
    system_design_score: Optional[Score] = None
    strengths: StrList = []
    concerns: StrList = []
    verdict: Verdict
    notes: str = ""


class HRVerdict(BaseModel):
    communication_score: Score
    culture_fit_score: Optional[Score] = None
    behavioral_score: Optional[Score] = None
    strengths: StrList = []
    concerns: StrList = []
    verdict: Verdict
    notes: str = ""


class DomainVerdict(BaseModel):
    domain_score: Score
    industry_knowledge: str = ""
    role_fit_score: Optional[Score] = None
    strengths: StrList = []
    concerns: StrList = []
    verdict: Verdict
    notes: str = ""


async def _evaluate(prompt: str, schema, fallback, name: str) -> dict:
    """Run one panelist; a fallback verdict is marked so consensus can surface it,
    and remarks citing protected attributes are removed (and recorded)."""
    result = await ainvoke_structured(prompt, schema, fallback=fallback, name=name)
    verdict = result.data.model_dump()
    verdict["strengths"], removed_s = strip_protected(verdict.get("strengths", []))
    verdict["concerns"], removed_c = strip_protected(verdict.get("concerns", []))
    removed = removed_s + removed_c
    if protected_attributes_in(verdict.get("notes", "")):
        removed.append({"text": verdict["notes"], "attributes": protected_attributes_in(verdict["notes"])})
        verdict["notes"] = ""
    return {**verdict, "ai_fallback": result.fallback_used, "protected_removed": removed}


class PanelState(TypedDict):
    # Input
    resume_text: str
    role: str
    qa_pairs: List[dict]

    # Each agent's verdict
    technical_verdict: dict
    hr_verdict: dict
    domain_verdict: dict

    # Final consensus
    panel_score: int
    panel_recommendation: str    # hire | strong_hire | no_hire | hold
    panel_notes: List[str]
    panel_report: dict

    logs: Annotated[List[str], operator.add]


async def technical_agent_eval(state: PanelState) -> dict:
    """Technical Agent: Evaluates coding, system design, technical depth."""
    qa_text = "\n".join([
        f"Q: {qa.get('question', '')}\nA: {qa.get('answer', '')}"
        for qa in state.get("qa_pairs", [])[:5]
    ])

    prompt = f"""You are a Senior Technical Interviewer evaluating a {state.get('role', 'Developer')} candidate.
Focus ONLY on technical accuracy, depth, and problem-solving.
Return ONLY valid JSON:
{{
  "technical_score": 72,
  "code_quality_assessment": "Good understanding of fundamentals",
  "system_design_score": 65,
  "strengths": ["Strong Node.js knowledge", "Good API design"],
  "concerns": ["Weak on distributed systems"],
  "verdict": "pass",
  "notes": "Candidate shows solid backend skills but needs improvement in scalability concepts"
}}

verdict must be: "strong_pass" | "pass" | "borderline" | "fail"

{FAIRNESS_RULE}
{UNTRUSTED_NOTE}

{wrap_untrusted("answers", qa_text[:2000])}

{wrap_untrusted("resume", redact_contact_info(state.get('resume_text', ''))[:1000])}"""

    result = await _evaluate(prompt, TechnicalVerdict, TechnicalVerdict(technical_score=60, verdict="borderline"), "panel.technical")

    return {
        "technical_verdict": result,
        "logs": [f"🔧 Technical Agent: {result.get('technical_score', 60)}/100 | {result.get('verdict', 'borderline')}"]
    }


async def hr_agent_eval(state: PanelState) -> dict:
    """HR Agent: Evaluates communication, culture fit, behavioral."""
    qa_text = "\n".join([
        f"Q: {qa.get('question', '')}\nA: {qa.get('answer', '')}"
        for qa in state.get("qa_pairs", [])[:5]
    ])

    prompt = f"""You are an HR Interviewer evaluating a {state.get('role', 'Developer')} candidate.
Focus ONLY on communication, culture fit, teamwork, and behavioral aspects.
Return ONLY valid JSON:
{{
  "communication_score": 78,
  "culture_fit_score": 80,
  "behavioral_score": 75,
  "strengths": ["Clear communicator", "Team player"],
  "concerns": ["Seems to prefer solo work"],
  "verdict": "pass",
  "notes": "Good cultural fit, communicates well under pressure"
}}

verdict must be: "strong_pass" | "pass" | "borderline" | "fail"

{FAIRNESS_RULE}
{UNTRUSTED_NOTE}

{wrap_untrusted("answers", qa_text[:2000])}"""

    result = await _evaluate(prompt, HRVerdict, HRVerdict(communication_score=65, verdict="borderline"), "panel.hr")

    return {
        "hr_verdict": result,
        "logs": [f"👥 HR Agent: {result.get('communication_score', 65)}/100 | {result.get('verdict', 'borderline')}"]
    }


async def domain_expert_eval(state: PanelState) -> dict:
    """Domain Expert: Evaluates role-specific knowledge."""
    qa_text = "\n".join([
        f"Q: {qa.get('question', '')}\nA: {qa.get('answer', '')}"
        for qa in state.get("qa_pairs", [])[:5]
    ])

    prompt = f"""You are a Domain Expert for {state.get('role', 'Developer')} roles.
Focus ONLY on domain-specific knowledge, industry awareness, and role fit.
Return ONLY valid JSON:
{{
  "domain_score": 70,
  "industry_knowledge": "Good understanding of current trends",
  "role_fit_score": 75,
  "strengths": ["Up-to-date with latest frameworks"],
  "concerns": ["Limited enterprise experience"],
  "verdict": "pass",
  "notes": "Solid domain knowledge for the role level"
}}

verdict must be: "strong_pass" | "pass" | "borderline" | "fail"

Role: {state.get('role', 'Developer')}
{FAIRNESS_RULE}
{UNTRUSTED_NOTE}

{wrap_untrusted("answers", qa_text[:2000])}"""

    result = await _evaluate(prompt, DomainVerdict, DomainVerdict(domain_score=65, verdict="borderline"), "panel.domain")

    return {
        "domain_verdict": result,
        "logs": [f"🎯 Domain Agent: {result.get('domain_score', 65)}/100 | {result.get('verdict', 'borderline')}"]
    }


def panel_consensus(state: PanelState) -> dict:
    """Final consensus from all 3 agents."""
    tech = state.get("technical_verdict", {})
    hr = state.get("hr_verdict", {})
    domain = state.get("domain_verdict", {})

    # Weighted average: Technical 50%, HR 25%, Domain 25%
    tech_score = int(tech.get("technical_score", 60))
    hr_score = int(hr.get("communication_score", 60))
    domain_score = int(domain.get("domain_score", 60))

    panel_score = int(tech_score * 0.5 + hr_score * 0.25 + domain_score * 0.25)

    # Verdict counting
    verdicts = [tech.get("verdict", "borderline"), hr.get("verdict", "borderline"), domain.get("verdict", "borderline")]
    strong_passes = verdicts.count("strong_pass")
    passes = verdicts.count("pass")
    fails = verdicts.count("fail")

    if strong_passes >= 2:
        recommendation = "strong_hire"
    elif passes + strong_passes >= 2:
        recommendation = "hire"
    elif fails >= 2:
        recommendation = "no_hire"
    else:
        recommendation = "hold"

    degraded = [name for name, v in (("technical", tech), ("hr", hr), ("domain", domain)) if v.get("ai_fallback")]

    notes = []
    if degraded:
        notes.append(f"⚠️ Default (non-AI) verdict used for: {', '.join(degraded)} — review before deciding")
    if tech.get("notes"): notes.append(f"Technical: {tech['notes']}")
    if hr.get("notes"): notes.append(f"HR: {hr['notes']}")
    if domain.get("notes"): notes.append(f"Domain: {domain['notes']}")

    report = {
        "role": state.get("role", ""),
        "panelScore": panel_score,
        "panelRecommendation": recommendation,
        "breakdown": {
            "technical": {"score": tech_score, "verdict": tech.get("verdict"), "strengths": tech.get("strengths", []), "concerns": tech.get("concerns", [])},
            "hr": {"score": hr_score, "verdict": hr.get("verdict"), "strengths": hr.get("strengths", []), "concerns": hr.get("concerns", [])},
            "domain": {"score": domain_score, "verdict": domain.get("verdict"), "strengths": domain.get("strengths", []), "concerns": domain.get("concerns", [])},
        },
        "panelNotes": notes,
        "guardrails": {
            "injectionSignals": sorted({
                signal for qa in state.get("qa_pairs", []) for signal in detect_injection(str(qa.get("answer", "")))
            }),
            "protectedAttributeMentionsRemoved": [
                r for v in (tech, hr, domain) for r in v.get("protected_removed", [])
            ],
        },
        "degradedAgents": degraded,
        "logs": state.get("logs", []),
    }

    return {
        "panel_score": panel_score,
        "panel_recommendation": recommendation,
        "panel_notes": notes,
        "panel_report": report,
        "logs": [f"🏛️ Panel consensus: {panel_score}/100 | {recommendation.upper()}"]
    }


def build_interview_panel_agent():
    workflow = StateGraph(PanelState)

    workflow.add_node("technical_eval", technical_agent_eval)
    workflow.add_node("hr_eval",        hr_agent_eval)
    workflow.add_node("domain_eval",    domain_expert_eval)
    workflow.add_node("consensus",      panel_consensus)

    # Fan-out: the three panelists are independent, so they run in the same
    # superstep (concurrently). Each writes its own state key and `logs` has an
    # append reducer, so their writes can't collide.
    for panelist in ("technical_eval", "hr_eval", "domain_eval"):
        workflow.add_edge(START, panelist)
    # Fan-in: consensus runs once, after all three have finished.
    workflow.add_edge(["technical_eval", "hr_eval", "domain_eval"], "consensus")
    workflow.add_edge("consensus",      END)

    return workflow.compile()


interview_panel_agent = build_interview_panel_agent()
