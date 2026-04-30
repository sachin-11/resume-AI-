"""
Candidate Screening Agent — State

Multi-source research:
Resume → GitHub → Skills Verify → JD Match → Report
"""
from typing import TypedDict, List, Optional, Annotated
import operator


class CandidateScreeningState(TypedDict):
    # Input
    resume_text: str
    job_description: str
    candidate_name: str
    candidate_email: str
    github_username: Optional[str]   # extracted from resume or provided

    # Research results
    extracted_skills: List[str]
    extracted_github: Optional[str]
    github_repos: List[dict]         # [{name, language, stars, description}]
    github_skill_match: List[str]    # skills verified via GitHub
    jd_match_score: int
    matched_skills: List[str]
    missing_skills: List[str]

    # Final output
    overall_rating: int              # 0-100
    screening_decision: str          # shortlist | maybe | reject
    decision_reasons: List[str]
    red_flags: List[str]
    green_flags: List[str]
    screening_report: dict

    logs: Annotated[List[str], operator.add]
