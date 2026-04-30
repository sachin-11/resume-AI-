"""
Interview Evaluator Agent — Graph

[START] → [evaluate_answers] → [detect_contradictions] → [generate_holistic_score] → [END]
"""
from langgraph.graph import StateGraph, END
from agents.interview_evaluator.state import InterviewEvaluatorState
from agents.interview_evaluator.nodes import (
    evaluate_answers,
    detect_contradictions,
    generate_holistic_score,
)


def build_interview_evaluator():
    workflow = StateGraph(InterviewEvaluatorState)

    workflow.add_node("evaluate_answers",       evaluate_answers)
    workflow.add_node("detect_contradictions",  detect_contradictions)
    workflow.add_node("generate_holistic_score",generate_holistic_score)

    workflow.set_entry_point("evaluate_answers")
    workflow.add_edge("evaluate_answers",       "detect_contradictions")
    workflow.add_edge("detect_contradictions",  "generate_holistic_score")
    workflow.add_edge("generate_holistic_score", END)

    return workflow.compile()


interview_evaluator_agent = build_interview_evaluator()
