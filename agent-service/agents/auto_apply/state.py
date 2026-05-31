"""
Auto Apply Agent — State Schema
"""
from typing import TypedDict, List, Optional, Annotated
import operator

class AutoApplyState(TypedDict):
    # Input configurations
    resume_text: str
    target_role: str
    location: str
    min_match_score: int
    limit: int

    # Application state
    found_jobs: List[dict]                  # [{jobTitle, company, location, jobUrl, matchScore, hrEmail}]
    tailored_resumes: List[dict]            # [{job_id, tailored_text}]
    cover_letters: List[dict]               # [{job_id, cover_letter_text}]
    
    # Tracking status
    hr_email: Optional[str]
    email_sent: bool
    logged_to_sheets: bool

    logs: Annotated[List[str], operator.add]
