"""
Recruitment Copilot Orchestrator — Graph

[START] → [classify_intent] →(route)→ [resume_screener | scheduler | faq | other] → [finalize] → [END]
"""
from langgraph.graph import StateGraph, END
from agents.orchestrator.state import OrchestratorState
from agents.orchestrator.nodes import (
    classify_intent,
    run_resume_screener,
    run_scheduler,
    run_faq_answerer,
    run_other,
    finalize,
)


def route_by_intent(state: OrchestratorState) -> str:
    return state.get("intent", "other")


def build_orchestrator_agent():
    workflow = StateGraph(OrchestratorState)

    workflow.add_node("classify_intent", classify_intent)
    workflow.add_node("resume_screening", run_resume_screener)
    workflow.add_node("scheduling", run_scheduler)
    workflow.add_node("faq", run_faq_answerer)
    workflow.add_node("other", run_other)
    workflow.add_node("finalize", finalize)

    workflow.set_entry_point("classify_intent")

    workflow.add_conditional_edges(
        "classify_intent",
        route_by_intent,
        {
            "resume_screening": "resume_screening",
            "scheduling": "scheduling",
            "faq": "faq",
            "other": "other",
        },
    )

    workflow.add_edge("resume_screening", "finalize")
    workflow.add_edge("scheduling", "finalize")
    workflow.add_edge("faq", "finalize")
    workflow.add_edge("other", "finalize")
    workflow.add_edge("finalize", END)

    return workflow.compile()


orchestrator_agent = build_orchestrator_agent()
