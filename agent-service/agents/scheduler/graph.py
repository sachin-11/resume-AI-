"""
Scheduler Agent — Graph

[START] → [propose_slots] → [draft_confirmation] → [END]
"""
from langgraph.graph import StateGraph, END
from agents.scheduler.state import SchedulerState
from agents.scheduler.nodes import propose_slots, draft_confirmation


def build_scheduler_agent():
    workflow = StateGraph(SchedulerState)

    workflow.add_node("propose_slots", propose_slots)
    workflow.add_node("draft_confirmation", draft_confirmation)

    workflow.set_entry_point("propose_slots")
    workflow.add_edge("propose_slots", "draft_confirmation")
    workflow.add_edge("draft_confirmation", END)

    # checkpointer=False: when run as a sub-agent of the checkpointed orchestrator,
    # don't persist this graph's internal steps (duplicate PII, wasted storage).
    return workflow.compile(checkpointer=False)


scheduler_agent = build_scheduler_agent()
