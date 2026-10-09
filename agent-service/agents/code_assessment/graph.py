"""
Coding Assessment Agent — Graph (runs candidate code in AWS Bedrock AgentCore Code Interpreter)

[START] → [plan_tests] → [run_reference] → [run_candidate] → [review_code] → [build_report] → [END]

Nodes after plan_tests skip their sandbox work when the state says "review_only"
(unsupported language, untestable question, sandbox down, unreliable tests),
so every path ends in the same report shape.
"""
import operator
from typing import Annotated, List, Optional, TypedDict

from langgraph.graph import END, StateGraph

from agents.code_assessment.nodes import build_report, plan_tests, review, run_candidate, run_reference


class CodeAssessmentState(TypedDict, total=False):
    question: str
    code: str
    language: str
    mode: str                 # "executed" | "review_only"
    skip_reason: str
    plan: dict
    cases: List[dict]         # args (+ expected once the reference has run)
    entry: Optional[str]
    tests: List[dict]
    run_notes: List[str]
    review: dict
    review_fallback: bool
    injection_signals: List[str]
    report: dict
    logs: Annotated[List[str], operator.add]


def build_code_assessment_agent():
    g = StateGraph(CodeAssessmentState)
    g.add_node("plan_tests", plan_tests)
    g.add_node("run_reference", run_reference)
    g.add_node("run_candidate", run_candidate)
    g.add_node("review_code", review)
    g.add_node("build_report", build_report)
    g.set_entry_point("plan_tests")
    g.add_edge("plan_tests", "run_reference")
    g.add_edge("run_reference", "run_candidate")
    g.add_edge("run_candidate", "review_code")
    g.add_edge("review_code", "build_report")
    g.add_edge("build_report", END)
    return g.compile()


code_assessment_agent = build_code_assessment_agent()
