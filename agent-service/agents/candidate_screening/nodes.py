"""
Candidate Screening Agent — Nodes
"""
import os
import re
from typing import Literal, Optional

from pydantic import BaseModel

import agents.shared.tools  # noqa: F401  (registers the tools)
from core.llm import ainvoke_structured
from core.tools import call_tool
from core.types import Score, StrList


# GitHub's own rule: alphanumerics and single hyphens, max 39 chars.
GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")


class CandidateInfo(BaseModel):
    skills: StrList = []
    github_username: Optional[str] = None
    years_experience: Optional[float] = None
    current_role: Optional[str] = None
    education: Optional[str] = None


class JDMatch(BaseModel):
    match_score: Score
    matched_skills: StrList = []
    missing_skills: StrList = []
    red_flags: StrList = []
    green_flags: StrList = []
    screening_decision: Literal["shortlist", "maybe", "reject"]
    decision_reasons: StrList = []


async def extract_candidate_info(state: dict) -> dict:
    """Node 1: Extract skills and GitHub username from resume."""
    prompt = f"""Extract information from this resume. Return ONLY valid JSON:
{{
  "skills": ["React", "Node.js", "PostgreSQL"],
  "github_username": "username_or_null",
  "years_experience": 4,
  "current_role": "Senior Developer",
  "education": "B.Tech Computer Science"
}}

github_username: extract from GitHub URL if present, else null

Resume:
{state.get('resume_text', '')[:2500]}"""

    result = await ainvoke_structured(
        prompt, CandidateInfo, fallback=CandidateInfo(),
        temperature=0, name="screening.extract_info",
    )
    info = result.data
    github = info.github_username if info.github_username not in (None, "", "null") else None
    github = github or state.get("github_username")
    note = " (⚠️ extraction reply invalid — no skills extracted)" if result.fallback_used else ""

    return {
        "extracted_skills": info.skills,
        "extracted_github": github,
        "logs": [f"✅ Extracted {len(info.skills)} skills. GitHub: {github or 'not found'}{note}"]
    }


async def fetch_github_data(state: dict) -> dict:
    """Node 2: Fetch public GitHub repos to verify skills — GitHub MCP server, falling back to the REST API."""
    github_username = state.get("extracted_github")

    if not github_username:
        return {
            "github_repos": [],
            "github_skill_match": [],
            "logs": ["⏭️ No GitHub username found — skipping GitHub check"]
        }
    if not GITHUB_USERNAME_RE.match(github_username):
        return {
            "github_repos": [],
            "github_skill_match": [],
            "logs": [f"⚠️ '{github_username[:40]}' is not a valid GitHub username — skipping GitHub check"]
        }

    repos, source, errors = None, "", []
    for tool_name, label in (("github.repos_mcp", "MCP"), ("github.repos_http", "HTTP")):
        if tool_name == "github.repos_mcp" and not (os.getenv("GITHUB_PERSONAL_ACCESS_TOKEN") or os.getenv("GITHUB_TOKEN")):
            continue  # the MCP server needs a token; the REST API works without one
        try:
            repos, source = await call_tool(tool_name, agent="candidate_screening", username=github_username), label
            break
        except Exception as e:
            errors.append(f"{label}: {type(e).__name__}")

    if repos is None:
        return {
            "github_repos": [],
            "github_skill_match": [],
            "logs": [f"⚠️ GitHub fetch failed ({', '.join(errors)})"]
        }

    languages = sorted({r["language"] for r in repos if r["language"]})
    fallback_note = f" (after {', '.join(errors)})" if errors else ""
    return {
        "github_repos": repos,
        "github_skill_match": languages,
        "logs": [f"✅ Found {len(repos)} GitHub repos via {source}{fallback_note}. Languages: {languages}"]
    }


async def match_against_jd(state: dict) -> dict:
    """Node 3: Match candidate profile against JD."""

    github_context = ""
    if state.get("github_repos"):
        repos_text = ", ".join([r["name"] for r in state["github_repos"][:5]])
        langs = ", ".join(state.get("github_skill_match", []))
        github_context = f"\nGitHub repos: {repos_text}\nVerified languages: {langs}"

    prompt = f"""Match this candidate against the job description. Return ONLY valid JSON:
{{
  "match_score": 72,
  "matched_skills": ["React", "Node.js"],
  "missing_skills": ["Docker", "Kubernetes"],
  "red_flags": ["Only 1 year experience, JD requires 3+"],
  "green_flags": ["Active GitHub with relevant projects", "Strong Node.js background"],
  "screening_decision": "shortlist",
  "decision_reasons": ["Strong technical match", "Relevant experience"]
}}

screening_decision must be: "shortlist" | "maybe" | "reject"

Candidate Skills: {state.get('extracted_skills', [])}
{github_context}

Job Description:
{state.get('job_description', '')[:2000]}

Resume:
{state.get('resume_text', '')[:1500]}"""

    result = await ainvoke_structured(
        prompt,
        JDMatch,
        fallback=JDMatch(match_score=50, screening_decision="maybe",
                         decision_reasons=["AI match reply was invalid — default score, needs manual review"]),
        temperature=0,
        name="screening.match_jd",
    )
    m = result.data
    note = " (⚠️ AI reply invalid — default used)" if result.fallback_used else ""

    return {
        "jd_match_score": m.match_score,
        "matched_skills": m.matched_skills,
        "missing_skills": m.missing_skills,
        "red_flags": m.red_flags,
        "green_flags": m.green_flags,
        "screening_decision": m.screening_decision,
        "decision_reasons": m.decision_reasons,
        "ai_fallback": result.fallback_used,
        "logs": [f"📊 JD Match: {m.match_score}% | Decision: {m.screening_decision}{note}"]
    }


def build_screening_report(state: dict) -> dict:
    """Node 4: Build final screening report."""
    score = state.get("jd_match_score", 50)
    decision = state.get("screening_decision", "maybe")

    # Boost score if GitHub verified skills
    github_boost = min(10, len(state.get("github_skill_match", [])) * 2)
    final_score = min(100, score + github_boost)

    report = {
        "candidateName": state.get("candidate_name", ""),
        "candidateEmail": state.get("candidate_email", ""),
        "overallRating": final_score,
        "screeningDecision": decision,
        "decisionReasons": state.get("decision_reasons", []),
        "matchedSkills": state.get("matched_skills", []),
        "missingSkills": state.get("missing_skills", []),
        "redFlags": state.get("red_flags", []),
        "greenFlags": state.get("green_flags", []),
        "githubUsername": state.get("extracted_github"),
        "githubRepos": state.get("github_repos", [])[:5],
        "githubVerifiedSkills": state.get("github_skill_match", []),
        "githubBoost": github_boost,
        "aiFallback": state.get("ai_fallback", False),
        "logs": state.get("logs", []),
    }

    return {
        "overall_rating": final_score,
        "screening_report": report,
        "logs": [f"🎉 Screening complete. Rating: {final_score}/100 | {decision.upper()}"]
    }
