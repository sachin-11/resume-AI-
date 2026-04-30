"""
Resume Improvement Agent — State Definition

This defines the shared state that flows through all nodes in the graph.
Think of it as the "memory" of the agent — every node reads from and writes to this.
"""

from typing import TypedDict, List, Optional, Annotated
import operator


class ResumeImprovementState(TypedDict):
    """
    Shared state for the Resume Improvement Agent.
    
    Flow:
    [analyze] → [identify_gaps] → [rewrite_sections] → [score_check] → [finalize]
                                                              ↓ (score < 70)
                                                        [rewrite_sections]  ← loop
    """

    # ── Input ────────────────────────────────────────────────────
    resume_text: str           # original resume raw text
    resume_id: str             # DB resume ID
    user_id: str               # DB user ID
    target_role: Optional[str] # e.g. "Senior React Developer"
    job_description: Optional[str]  # optional JD to tailor against

    # ── Analysis results ─────────────────────────────────────────
    initial_score: int         # ATS score before improvement (0-100)
    current_score: int         # current score after rewrites
    skills: List[str]          # detected skills
    missing_skills: List[str]  # skills to add
    weak_sections: List[str]   # sections that need improvement
    strengths: List[str]       # what's already good

    # ── Rewrite results ──────────────────────────────────────────
    improved_summary: str      # rewritten professional summary
    improved_bullets: List[dict]  # [{section, original, improved, reason}]
    keywords_added: List[str]  # keywords injected
    title_suggestion: str      # suggested job title

    # ── Iteration control ────────────────────────────────────────
    iteration: int             # how many rewrite loops done (max 3)
    max_iterations: int        # stop after this many loops

    # ── Final output ─────────────────────────────────────────────
    improvement_report: dict   # full report to return to Next.js
    error: Optional[str]       # error message if something failed

    # ── Messages log (for debugging) ─────────────────────────────
    logs: Annotated[List[str], operator.add]  # append-only log
