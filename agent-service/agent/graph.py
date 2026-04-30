"""
Resume Improvement Agent — LangGraph Graph Definition

This is the heart of the agent — defines the flow between nodes
and the conditional logic (when to loop, when to stop).

Graph structure:
                    ┌─────────────────────────────────┐
                    │                                 │
[START] → [analyze] → [identify_gaps] → [rewrite] → [score_check]
                                                          │
                                              score >= 70 OR iteration >= max
                                                          │
                                                    [finalize] → [END]
                                                          │
                                              score < 70 AND iteration < max
                                                          │
                                                    [rewrite] ← loop back
"""

from langgraph.graph import StateGraph, END
from agent.state import ResumeImprovementState
from agent.nodes import (
    analyze_resume,
    identify_gaps,
    rewrite_sections,
    score_check,
    finalize_report,
)


# ── Conditional Edge: Should we loop or finalize? ────────────────
def should_continue_improving(state: ResumeImprovementState) -> str:
    """
    Decision node: After scoring, decide next step.
    
    Returns:
        "rewrite"  → score still low, try again
        "finalize" → score good enough OR max iterations reached
    """
    current_score = state.get("current_score", 0)
    iteration = state.get("iteration", 0)
    max_iterations = state.get("max_iterations", 3)

    # Stop conditions
    if current_score >= 70:
        return "finalize"   # ✅ Good enough score
    if iteration >= max_iterations:
        return "finalize"   # ⏹️ Max loops reached
    
    return "rewrite"        # 🔄 Try again


# ── Build the Graph ──────────────────────────────────────────────
def build_resume_agent() -> StateGraph:
    """
    Builds and compiles the Resume Improvement Agent graph.
    
    Returns a compiled LangGraph app ready to invoke.
    """
    # Create graph with our state schema
    workflow = StateGraph(ResumeImprovementState)

    # ── Add nodes ────────────────────────────────────────────────
    workflow.add_node("analyze",       analyze_resume)
    workflow.add_node("identify_gaps", identify_gaps)
    workflow.add_node("rewrite",       rewrite_sections)
    workflow.add_node("score_check",   score_check)
    workflow.add_node("finalize",      finalize_report)

    # ── Define edges (flow) ──────────────────────────────────────
    workflow.set_entry_point("analyze")

    workflow.add_edge("analyze",       "identify_gaps")
    workflow.add_edge("identify_gaps", "rewrite")
    workflow.add_edge("rewrite",       "score_check")

    # Conditional edge: loop or finish
    workflow.add_conditional_edges(
        "score_check",
        should_continue_improving,
        {
            "rewrite":  "rewrite",    # loop back
            "finalize": "finalize",   # move forward
        }
    )

    workflow.add_edge("finalize", END)

    return workflow.compile()


# ── Singleton instance ───────────────────────────────────────────
resume_agent = build_resume_agent()
