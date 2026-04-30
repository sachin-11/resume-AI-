"""
Candidate Screening Agent — Graph

[START] → [extract_info] → [fetch_github] → [match_jd] → [build_report] → [END]
"""
from langgraph.graph import StateGraph, END
from agents.candidate_screening.state import CandidateScreeningState
from agents.candidate_screening.nodes import (
    extract_candidate_info,
    fetch_github_data,
    match_against_jd,
    build_screening_report,
)


def build_candidate_screening_agent():
    workflow = StateGraph(CandidateScreeningState)

    workflow.add_node("extract_info",    extract_candidate_info)
    workflow.add_node("fetch_github",    fetch_github_data)
    workflow.add_node("match_jd",        match_against_jd)
    workflow.add_node("build_report",    build_screening_report)

    workflow.set_entry_point("extract_info")
    workflow.add_edge("extract_info",  "fetch_github")
    workflow.add_edge("fetch_github",  "match_jd")
    workflow.add_edge("match_jd",      "build_report")
    workflow.add_edge("build_report",  END)

    return workflow.compile()


candidate_screening_agent = build_candidate_screening_agent()
