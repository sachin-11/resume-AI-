"""
Auto Apply Agent — Graph Definition
"""
from langgraph.graph import StateGraph, END
from agents.auto_apply.state import AutoApplyState
from agents.auto_apply.nodes import (
    search_jobs_node,
    match_and_score_node,
    tailor_resume_node,
    generate_cover_letter_node
)

def build_auto_apply_agent():
    workflow = StateGraph(AutoApplyState)

    # Add processing nodes
    workflow.add_node("search_jobs",           search_jobs_node)
    workflow.add_node("match_and_score",       match_and_score_node)
    workflow.add_node("tailor_resume",         tailor_resume_node)
    workflow.add_node("generate_cover_letter", generate_cover_letter_node)

    # Set flow edges
    workflow.set_entry_point("search_jobs")
    workflow.add_edge("search_jobs",           "match_and_score")
    workflow.add_edge("match_and_score",       "tailor_resume")
    workflow.add_edge("tailor_resume",         "generate_cover_letter")
    workflow.add_edge("generate_cover_letter", END)

    return workflow.compile()

auto_apply_agent = build_auto_apply_agent()
