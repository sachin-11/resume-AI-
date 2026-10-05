"""
Recruitment Copilot Orchestrator — Graph (planner + supervisor loop)

[START] → [planner] → [supervisor] ─(next_step)→ [resume_screening | scheduling | faq | other] ─┐
                        ▲                                                                   │
                        └───────────────────────── back to supervisor ──────────────────────┘
                   supervisor ─(plan done)→ [finalize] → [END]

The planner (one LLM call) turns a message into ≤3 steps, e.g.
  "screen her and, if shortlisted, book an interview" → screening → scheduling(if_shortlisted).
The supervisor is deterministic: it runs the steps in order and skips a conditional
step whose condition the actual results don't meet.

With a checkpointer, two human-in-the-loop gates sit between a worker and the supervisor:
  resume_screening → [review_rejection] → supervisor   (AI "reject" needs recruiter confirmation)
  scheduling       → [approve_booking]  → supervisor   (booking + candidate email needs approval)
A recruiter overriding a reject to "shortlist" therefore unlocks an if_shortlisted step.
"""
from langgraph.graph import StateGraph, END
from agents.orchestrator.state import OrchestratorState
from agents.orchestrator.nodes import (
    approve_booking,
    finalize,
    plan_steps,
    review_rejection,
    run_faq_answerer,
    run_other,
    run_resume_screener,
    run_scheduler,
    supervisor,
)

WORKERS = ("resume_screening", "scheduling", "faq", "other")


def route_next(state: OrchestratorState) -> str:
    return state.get("next_step") or "finalize"


def build_orchestrator_agent(checkpointer=None):
    """Compile the orchestrator. Pass a checkpointer for multi-turn (thread) memory.

    The human-review gates need a checkpointer (interrupt() persists the paused
    run), so the stateless build skips them and only flags rejects for review.
    """
    workflow = StateGraph(OrchestratorState)
    human_gates = checkpointer is not None

    workflow.add_node("planner", plan_steps)
    workflow.add_node("supervisor", supervisor)
    workflow.add_node("resume_screening", run_resume_screener)
    workflow.add_node("scheduling", run_scheduler)
    workflow.add_node("faq", run_faq_answerer)
    workflow.add_node("other", run_other)
    workflow.add_node("finalize", finalize)

    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "supervisor")
    workflow.add_conditional_edges(
        "supervisor", route_next, {**{w: w for w in WORKERS}, "finalize": "finalize"},
    )

    if human_gates:
        workflow.add_node("review_rejection", review_rejection)
        workflow.add_node("approve_booking", approve_booking)
        workflow.add_edge("resume_screening", "review_rejection")
        workflow.add_edge("review_rejection", "supervisor")
        workflow.add_edge("scheduling", "approve_booking")
        workflow.add_edge("approve_booking", "supervisor")
    else:
        workflow.add_edge("resume_screening", "supervisor")
        workflow.add_edge("scheduling", "supervisor")
    workflow.add_edge("faq", "supervisor")
    workflow.add_edge("other", "supervisor")
    workflow.add_edge("finalize", END)

    return workflow.compile(checkpointer=checkpointer)


# Stateless instance (no memory). The API builds a checkpointed one at startup.
orchestrator_agent = build_orchestrator_agent()
