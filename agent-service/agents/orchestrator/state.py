"""
Recruitment Copilot Orchestrator — State

Central router: a user message comes in, gets classified into an intent,
and gets dispatched to the right sub-agent (resume screener, scheduler, FAQ answerer).
"""
from typing import TypedDict, List, Optional, Annotated
import operator

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class OrchestratorState(TypedDict):
    # Conversation history across turns (persisted by the checkpointer when the
    # graph runs with a thread). Each turn appends the user message and a reply.
    messages: Annotated[List[AnyMessage], add_messages]

    # Input — the current turn's message
    user_message: str
    resume_text: Optional[str]
    job_description: Optional[str]
    candidate_name: Optional[str]
    candidate_email: Optional[str]
    github_username: Optional[str]
    existing_slots: List[dict]   # InterviewSlot rows from Prisma, for the scheduling branch

    # Planning + supervisor loop (all reset every turn)
    plan: List[dict]             # [{intent, condition}] — up to 3 steps, e.g. screen → (if shortlisted) schedule
    step_index: int              # next plan step the supervisor will look at
    next_step: str               # supervisor's routing decision: an intent, or "finalize"
    executed_steps: List[str]    # intents actually run this turn, in order
    skipped_steps: List[dict]    # [{intent, reason}] — steps whose condition wasn't met

    # Routing
    intent: str            # step currently/last run: resume_screening | scheduling | faq | other
    intent_reasoning: str

    # Sub-agent outputs (only the one matching `intent` gets filled in)
    resume_screener_result: dict
    scheduler_result: dict
    faq_result: dict
    other_result: dict

    # Guardrail / eval
    needs_human_review: bool
    review_reasons: List[str]

    # Final
    final_response: dict
    logs: Annotated[List[str], operator.add]
