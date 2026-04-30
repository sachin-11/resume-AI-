"""
Interview Evaluator Agent — Nodes

Dynamic evaluation with follow-up detection and contradiction checking.
"""
import json
from typing import Any
from agents.shared.llm import get_llm, safe_json_parse


def evaluate_answers(state: dict) -> dict:
    """Node 1: Evaluate each Q&A pair, detect if follow-up was needed."""
    llm = get_llm()
    qa_pairs = state.get("qa_pairs", [])
    role = state.get("role", "Software Developer")
    round_type = state.get("round_type", "technical")

    evaluated = []
    for qa in qa_pairs:
        prompt = f"""Evaluate this interview answer for a {role} ({round_type} round).
Return ONLY valid JSON:
{{
  "score": 72,
  "feedback": "specific feedback on this answer",
  "needs_followup": false,
  "followup_question": "optional follow-up question if needed",
  "answer_quality": "excellent|good|average|poor"
}}

Question: {qa.get('question', '')}
Answer: {qa.get('answer', '')}"""

        response = llm.invoke(prompt)
        result = safe_json_parse(response.content if hasattr(response, 'content') else str(response), {
            "score": 50, "feedback": "Could not evaluate", "needs_followup": False,
            "followup_question": None, "answer_quality": "average"
        })

        evaluated.append({
            "question": qa.get("question", ""),
            "answer": qa.get("answer", ""),
            "followUpAsked": False,
            "followUpAnswer": None,
            "score": int(result.get("score", 50)),
            "feedback": result.get("feedback", ""),
            "needs_followup": result.get("needs_followup", False),
            "followup_question": result.get("followup_question"),
        })

    return {
        "evaluated_qa": evaluated,
        "logs": [f"✅ Evaluated {len(evaluated)} Q&A pairs"]
    }


def detect_contradictions(state: dict) -> dict:
    """Node 2: Check for contradictions across all answers."""
    llm = get_llm()
    evaluated = state.get("evaluated_qa", [])

    if len(evaluated) < 2:
        return {"contradictions": [], "logs": ["⏭️ Not enough answers to check contradictions"]}

    qa_text = "\n".join([
        f"Q{i+1}: {qa['question']}\nA{i+1}: {qa['answer']}"
        for i, qa in enumerate(evaluated)
    ])

    prompt = f"""Analyze these interview answers for contradictions or inconsistencies.
Return ONLY valid JSON:
{{
  "contradictions": [
    "Candidate said X in Q2 but Y in Q5 — inconsistent"
  ],
  "consistency_score": 85
}}

If no contradictions found, return empty array.

Answers:
{qa_text[:3000]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"contradictions": [], "consistency_score": 80}
    )

    contradictions = result.get("contradictions", [])
    return {
        "contradictions": contradictions,
        "logs": [f"🔍 Found {len(contradictions)} contradiction(s)"]
    }


def generate_holistic_score(state: dict) -> dict:
    """Node 3: Generate final holistic evaluation."""
    llm = get_llm()
    evaluated = state.get("evaluated_qa", [])
    contradictions = state.get("contradictions", [])
    role = state.get("role", "Software Developer")
    round_type = state.get("round_type", "technical")
    resume_text = state.get("resume_text", "")

    avg_score = sum(qa.get("score", 50) for qa in evaluated) // max(len(evaluated), 1)
    contradiction_penalty = len(contradictions) * 5

    qa_summary = "\n".join([
        f"Q: {qa['question'][:100]}\nScore: {qa['score']}/100\nFeedback: {qa['feedback'][:100]}"
        for qa in evaluated[:5]
    ])

    prompt = f"""Generate a comprehensive interview evaluation for a {role} candidate ({round_type} round).
Return ONLY valid JSON:
{{
  "overall_score": 72,
  "technical_score": 70,
  "communication_score": 75,
  "confidence_score": 68,
  "strengths": ["strength1", "strength2", "strength3"],
  "weak_areas": ["area1", "area2"],
  "improvement_roadmap": ["step1", "step2", "step3"],
  "summary": "2-3 sentence overall assessment",
  "hire_recommendation": "yes"
}}

hire_recommendation must be: "strong_yes" | "yes" | "maybe" | "no"

Average answer score: {avg_score}/100
Contradictions found: {len(contradictions)}
Contradiction penalty: -{contradiction_penalty} points

Q&A Summary:
{qa_summary}

{f'Contradictions: {chr(10).join(contradictions)}' if contradictions else ''}
{f'Resume context: {resume_text[:500]}' if resume_text else ''}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {
            "overall_score": avg_score, "technical_score": avg_score,
            "communication_score": avg_score, "confidence_score": avg_score,
            "strengths": [], "weak_areas": [], "improvement_roadmap": [],
            "summary": "Evaluation complete.", "hire_recommendation": "maybe"
        }
    )

    final_score = max(0, min(100, int(result.get("overall_score", avg_score)) - contradiction_penalty))

    return {
        "overall_score": final_score,
        "technical_score": int(result.get("technical_score", avg_score)),
        "communication_score": int(result.get("communication_score", avg_score)),
        "confidence_score": int(result.get("confidence_score", avg_score)),
        "strengths": result.get("strengths", []),
        "weak_areas": result.get("weak_areas", []),
        "improvement_roadmap": result.get("improvement_roadmap", []),
        "summary": result.get("summary", ""),
        "hire_recommendation": result.get("hire_recommendation", "maybe"),
        "logs": [f"🎯 Final score: {final_score}/100 | Recommendation: {result.get('hire_recommendation', 'maybe')}"]
    }
