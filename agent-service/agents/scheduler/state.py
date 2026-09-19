"""
Scheduler Agent — State

Proposes interview slots and drafts the confirmation message.
Tries a Calendar MCP tool first (opt-in via env), falls back to the
app's own InterviewSlot rows, then to algorithmically generated slots.
"""
from typing import TypedDict, List, Optional, Annotated
import operator


class SchedulerState(TypedDict):
    # Input
    candidate_name: str
    candidate_email: str
    role: str
    requested_timeframe: str          # free text, e.g. "next week afternoon"
    timezone: str
    existing_slots: List[dict]        # InterviewSlot rows passed in from Next.js: {id, startsAt, durationMin, isBooked}

    # Output
    calendar_source: str              # "calendar_mcp" | "db_slots" | "generated"
    proposed_slots: List[dict]        # [{startsAt, durationMin, slotId?}]
    confirmation_message: str

    logs: Annotated[List[str], operator.add]
