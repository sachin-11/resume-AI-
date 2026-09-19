"""
Recruitment Copilot Orchestrator — State

Central router: a user message comes in, gets classified into an intent,
and gets dispatched to the right sub-agent (resume screener, scheduler, FAQ answerer).
"""
from typing import TypedDict, List, Optional, Annotated
import operator


class OrchestratorState(TypedDict):
    # Input
    user_message: str
    resume_text: Optional[str]
    job_description: Optional[str]
    candidate_name: Optional[str]
    candidate_email: Optional[str]
    github_username: Optional[str]
    existing_slots: List[dict]   # InterviewSlot rows from Prisma, for the scheduling branch

    # Routing
    intent: str            # resume_screening | scheduling | faq | other
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
