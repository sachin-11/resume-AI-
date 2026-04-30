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
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Optional, Annotated
import operator
from agents.shared.llm import get_llm, safe_json_parse


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


def technical_agent_eval(state: PanelState) -> dict:
    """Technical Agent: Evaluates coding, system design, technical depth."""
    llm = get_llm()
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

Q&A:
{qa_text[:2000]}

Resume:
{state.get('resume_text', '')[:1000]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"technical_score": 60, "verdict": "borderline", "strengths": [], "concerns": [], "notes": ""}
    )

    return {
        "technical_verdict": result,
        "logs": [f"🔧 Technical Agent: {result.get('technical_score', 60)}/100 | {result.get('verdict', 'borderline')}"]
    }


def hr_agent_eval(state: PanelState) -> dict:
    """HR Agent: Evaluates communication, culture fit, behavioral."""
    llm = get_llm()
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

Q&A:
{qa_text[:2000]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"communication_score": 65, "verdict": "borderline", "strengths": [], "concerns": [], "notes": ""}
    )

    return {
        "hr_verdict": result,
        "logs": [f"👥 HR Agent: {result.get('communication_score', 65)}/100 | {result.get('verdict', 'borderline')}"]
    }


def domain_expert_eval(state: PanelState) -> dict:
    """Domain Expert: Evaluates role-specific knowledge."""
    llm = get_llm()
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
Q&A:
{qa_text[:2000]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"domain_score": 65, "verdict": "borderline", "strengths": [], "concerns": [], "notes": ""}
    )

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

    notes = []
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

    workflow.set_entry_point("technical_eval")
    # Sequential for now (parallel requires async setup)
    workflow.add_edge("technical_eval", "hr_eval")
    workflow.add_edge("hr_eval",        "domain_eval")
    workflow.add_edge("domain_eval",    "consensus")
    workflow.add_edge("consensus",      END)

    return workflow.compile()


interview_panel_agent = build_interview_panel_agent()
