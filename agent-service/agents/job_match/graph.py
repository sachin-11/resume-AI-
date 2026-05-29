"""
Job Match Agent — Graph

[START] → [parse_jd] → [deep_match] → [mock_interview] → [salary_insight] → [strategy] → [build_report] → [END]
"""
from langgraph.graph import StateGraph, END
from agents.job_match.state import JobMatchState
from agents.job_match.nodes import (
    parse_jd,
    deep_match,
    mock_interview,
    salary_insight,
    strategy,
    build_report,
)


def build_job_match_agent():
    workflow = StateGraph(JobMatchState)

    workflow.add_node("parse_jd",       parse_jd)
    workflow.add_node("deep_match",     deep_match)
    workflow.add_node("mock_interview", mock_interview)
    workflow.add_node("salary_insight", salary_insight)
    workflow.add_node("strategy",       strategy)
    workflow.add_node("build_report",   build_report)

    workflow.set_entry_point("parse_jd")
    workflow.add_edge("parse_jd",       "deep_match")
    workflow.add_edge("deep_match",     "mock_interview")
    workflow.add_edge("mock_interview", "salary_insight")
    workflow.add_edge("salary_insight", "strategy")
    workflow.add_edge("strategy",       "build_report")
    workflow.add_edge("build_report",   END)

    return workflow.compile()


job_match_agent = build_job_match_agent()
