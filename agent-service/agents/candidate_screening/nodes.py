"""
Candidate Screening Agent — Nodes
"""
import re
import httpx
from agents.shared.llm import get_llm, safe_json_parse


def extract_candidate_info(state: dict) -> dict:
    """Node 1: Extract skills and GitHub username from resume."""
    llm = get_llm()

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

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"skills": [], "github_username": None, "years_experience": 0}
    )

    github = result.get("github_username") or state.get("github_username")

    return {
        "extracted_skills": result.get("skills", []),
        "extracted_github": github,
        "logs": [f"✅ Extracted {len(result.get('skills', []))} skills. GitHub: {github or 'not found'}"]
    }


def fetch_github_data(state: dict) -> dict:
    """Node 2: Fetch public GitHub repos to verify skills."""
    github_username = state.get("extracted_github")

    if not github_username:
        return {
            "github_repos": [],
            "github_skill_match": [],
            "logs": ["⏭️ No GitHub username found — skipping GitHub check"]
        }

    try:
        with httpx.Client(timeout=10) as client:
            res = client.get(
                f"https://api.github.com/users/{github_username}/repos",
                params={"sort": "updated", "per_page": 10},
                headers={"Accept": "application/vnd.github.v3+json"}
            )
            if res.status_code != 200:
                return {
                    "github_repos": [],
                    "github_skill_match": [],
                    "logs": [f"⚠️ GitHub API returned {res.status_code} for {github_username}"]
                }

            repos = res.json()
            simplified = [
                {
                    "name": r.get("name", ""),
                    "language": r.get("language", ""),
                    "stars": r.get("stargazers_count", 0),
                    "description": (r.get("description") or "")[:100],
                    "topics": r.get("topics", []),
                }
                for r in repos if not r.get("fork", False)
            ]

            # Extract languages used
            languages = list(set(r["language"] for r in simplified if r["language"]))

            return {
                "github_repos": simplified,
                "github_skill_match": languages,
                "logs": [f"✅ Found {len(simplified)} GitHub repos. Languages: {languages}"]
            }
    except Exception as e:
        return {
            "github_repos": [],
            "github_skill_match": [],
            "logs": [f"⚠️ GitHub fetch failed: {str(e)}"]
        }


def match_against_jd(state: dict) -> dict:
    """Node 3: Match candidate profile against JD."""
    llm = get_llm()

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

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {
            "match_score": 50, "matched_skills": [], "missing_skills": [],
            "red_flags": [], "green_flags": [],
            "screening_decision": "maybe", "decision_reasons": []
        }
    )

    return {
        "jd_match_score": int(result.get("match_score", 50)),
        "matched_skills": result.get("matched_skills", []),
        "missing_skills": result.get("missing_skills", []),
        "red_flags": result.get("red_flags", []),
        "green_flags": result.get("green_flags", []),
        "screening_decision": result.get("screening_decision", "maybe"),
        "decision_reasons": result.get("decision_reasons", []),
        "logs": [f"📊 JD Match: {result.get('match_score', 50)}% | Decision: {result.get('screening_decision', 'maybe')}"]
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
        "logs": state.get("logs", []),
    }

    return {
        "overall_rating": final_score,
        "screening_report": report,
        "logs": [f"🎉 Screening complete. Rating: {final_score}/100 | {decision.upper()}"]
    }
