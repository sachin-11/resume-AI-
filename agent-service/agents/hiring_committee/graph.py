"""
Hiring Committee Agent — Graph (map-reduce multi-agent)

[START] ─(Send × N)─► [assess_candidate]  (one branch per candidate, in parallel)
                              │  each branch appends to `assessments`
                              ▼
                          [rank_candidates] → [END]

The fan-out uses LangGraph's Send API: the number of branches is decided at run
time from the data (one per candidate). Callers cap parallelism with
max_concurrency so 100 candidates don't mean 100 simultaneous LLM calls.
"""
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from agents.hiring_committee.nodes import assess_candidate, rank_candidates
from agents.hiring_committee.state import CommitteeState


def fan_out(state: CommitteeState):
    candidates = state.get("candidates") or []
    if not candidates:
        return "rank_candidates"
    return [
        Send("assess_candidate", {
            "candidate": c,
            "role": state.get("role", ""),
            "job_description": state.get("job_description", ""),
        })
        for c in candidates
    ]


def build_hiring_committee_agent():
    workflow = StateGraph(CommitteeState)
    workflow.add_node("assess_candidate", assess_candidate)
    workflow.add_node("rank_candidates", rank_candidates)

    workflow.add_conditional_edges(START, fan_out, ["assess_candidate", "rank_candidates"])
    workflow.add_edge("assess_candidate", "rank_candidates")   # waits for every branch
    workflow.add_edge("rank_candidates", END)
    return workflow.compile()


hiring_committee_agent = build_hiring_committee_agent()
