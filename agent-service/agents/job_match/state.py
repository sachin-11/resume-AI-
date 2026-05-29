"""
Job Match Agent — State
"""
from typing import TypedDict, Optional


class JobMatchState(TypedDict):
    # ── Inputs ────────────────────────────────────────────────────
    resume_text: str
    job_description: str
    resume_id: str
    user_id: str

    # ── Node 1: parse_jd ─────────────────────────────────────────
    jd_title: str
    jd_company: str
    jd_must_have: list        # Critical skills / requirements
    jd_nice_to_have: list     # Bonus / preferred requirements
    jd_responsibilities: list
    jd_red_flags: list        # Warning signs in the JD itself
    jd_culture_signals: list  # Values / culture cues from JD

    # ── Node 2: deep_match ───────────────────────────────────────
    fit_score: int            # 0-100
    fit_verdict: str          # strong_fit | good_fit | stretch | low_fit
    competitive_edge: list    # Candidate standout points
    critical_gaps: list       # Must-have skills missing
    optional_gaps: list       # Nice-to-have skills missing
    match_summary: str

    # ── Node 3: mock_interview ───────────────────────────────────
    mock_questions: list      # [{question, type, model_answer, tips}]

    # ── Node 4: salary_insight ───────────────────────────────────
    salary_min: int
    salary_max: int
    salary_currency: str
    salary_factors: list
    negotiation_tip: str

    # ── Node 5: strategy ─────────────────────────────────────────
    application_strategy: str
    timing_advice: str
    referral_tips: list
    linkedin_tips: list
    application_dos: list
    application_donts: list

    # ── Output ────────────────────────────────────────────────────
    final_report: dict
    logs: list
