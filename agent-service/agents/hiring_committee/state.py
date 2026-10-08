"""
Hiring Committee Agent — State

A campaign's completed candidates are assessed in parallel (one branch per
candidate, LangGraph Send API), then ranked into a shortlist.
"""
from typing import Annotated, List, TypedDict
import operator


class CommitteeState(TypedDict, total=False):
    # Input
    role: str
    job_description: str
    shortlist_size: int
    candidates: List[dict]       # interview results per candidate (see main.CommitteeCandidate)

    # Each parallel branch appends one assessment
    assessments: Annotated[List[dict], operator.add]

    # Output
    report: dict
    logs: Annotated[List[str], operator.add]


class CandidateTask(TypedDict):
    """What a single parallel branch receives (via Send)."""
    candidate: dict
    role: str
    job_description: str
