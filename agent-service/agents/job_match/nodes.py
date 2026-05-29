"""
Job Match Agent — Nodes

Flow:
  parse_jd → deep_match → mock_interview → salary_insight → strategy → build_report
"""
from agents.shared.llm import get_llm, safe_json_parse


def parse_jd(state: dict) -> dict:
    """Node 1: Extract structured intelligence from the job description."""
    llm = get_llm()

    prompt = f"""Analyze this job description and extract structured data. Return ONLY valid JSON:
{{
  "title": "Senior Backend Engineer",
  "company": "Acme Corp",
  "must_have": ["Node.js", "PostgreSQL", "5+ years experience"],
  "nice_to_have": ["Docker", "AWS", "GraphQL"],
  "responsibilities": ["Build REST APIs", "Review code", "Mentor juniors"],
  "red_flags": ["Unpaid trial period", "Unrealistic stack breadth", "No mention of salary"],
  "culture_signals": ["Fast-paced startup", "Remote-friendly", "Strong ownership culture"]
}}

red_flags: identify any concerning patterns in the JD (unrealistic requirements, vague role, no salary, etc.)
culture_signals: infer company culture from language, perks, tone

Job Description:
{state.get('job_description', '')[:3000]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {
            "title": "Unknown Role", "company": "Unknown Company",
            "must_have": [], "nice_to_have": [], "responsibilities": [],
            "red_flags": [], "culture_signals": [],
        }
    )

    return {
        "jd_title": result.get("title", "Unknown Role"),
        "jd_company": result.get("company", "Unknown Company"),
        "jd_must_have": result.get("must_have", []),
        "jd_nice_to_have": result.get("nice_to_have", []),
        "jd_responsibilities": result.get("responsibilities", []),
        "jd_red_flags": result.get("red_flags", []),
        "jd_culture_signals": result.get("culture_signals", []),
        "logs": [f"✅ JD parsed: {result.get('title')} @ {result.get('company')} | {len(result.get('must_have', []))} must-haves, {len(result.get('red_flags', []))} red flags"],
    }


def deep_match(state: dict) -> dict:
    """Node 2: Deep semantic fit analysis with competitive positioning."""
    llm = get_llm()

    prompt = f"""You are a senior technical recruiter. Perform a deep fit analysis.
Return ONLY valid JSON:
{{
  "fit_score": 74,
  "fit_verdict": "good_fit",
  "competitive_edge": [
    "5 years of Node.js matches requirement exactly",
    "AWS experience is a differentiator"
  ],
  "critical_gaps": [
    "Missing Kubernetes — listed as must-have"
  ],
  "optional_gaps": [
    "No GraphQL experience (nice-to-have)"
  ],
  "match_summary": "Strong backend candidate. Main risk is the Kubernetes gap which appears critical. The AWS experience and Node.js depth are strong selling points."
}}

fit_verdict must be one of: strong_fit | good_fit | stretch | low_fit
  - strong_fit: 80+, meets almost all must-haves
  - good_fit: 60-79, meets most must-haves, minor gaps
  - stretch: 40-59, meets some must-haves, notable gaps
  - low_fit: <40, significant mismatch

Must-have requirements: {state.get('jd_must_have', [])}
Nice-to-have requirements: {state.get('jd_nice_to_have', [])}
Role: {state.get('jd_title', '')} at {state.get('jd_company', '')}

Candidate Resume (excerpt):
{state.get('resume_text', '')[:2500]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {
            "fit_score": 50, "fit_verdict": "stretch",
            "competitive_edge": [], "critical_gaps": [], "optional_gaps": [],
            "match_summary": "Could not analyze fit.",
        }
    )

    score = int(result.get("fit_score", 50))
    verdict = result.get("fit_verdict", "stretch")
    return {
        "fit_score": min(100, max(0, score)),
        "fit_verdict": verdict if verdict in ["strong_fit", "good_fit", "stretch", "low_fit"] else "stretch",
        "competitive_edge": result.get("competitive_edge", []),
        "critical_gaps": result.get("critical_gaps", []),
        "optional_gaps": result.get("optional_gaps", []),
        "match_summary": result.get("match_summary", ""),
        "logs": [f"📊 Fit Score: {score}/100 | Verdict: {verdict} | {len(result.get('critical_gaps', []))} critical gaps"],
    }


def mock_interview(state: dict) -> dict:
    """Node 3: Generate 5 highly targeted mock interview questions with model answers."""
    llm = get_llm()

    prompt = f"""Generate 5 targeted interview questions for this specific role and candidate.
Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question": "Walk me through how you've handled database performance issues at scale.",
      "type": "technical",
      "model_answer": "I would start by profiling the queries using EXPLAIN ANALYZE, identify N+1 issues, add appropriate indexes, and if needed, introduce read replicas...",
      "tips": "Mention a specific incident. Quantify the improvement (e.g., query time went from 3s to 50ms)."
    }}
  ]
}}

type must be one of: technical | behavioral | situational | culture_fit

Make questions SPECIFIC to:
1. The role's must-have skills: {state.get('jd_must_have', [])}
2. The candidate's experience gaps: {state.get('critical_gaps', [])}
3. The company culture: {state.get('jd_culture_signals', [])}

Role: {state.get('jd_title', '')} at {state.get('jd_company', '')}

Candidate Resume (excerpt):
{state.get('resume_text', '')[:1500]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"questions": []}
    )

    questions = result.get("questions", [])
    return {
        "mock_questions": questions[:6],
        "logs": [f"🎤 Generated {len(questions)} mock interview questions"],
    }


def salary_insight(state: dict) -> dict:
    """Node 4: Estimate salary range and provide negotiation intelligence."""
    llm = get_llm()

    prompt = f"""Estimate the salary range for this role and provide negotiation advice.
Return ONLY valid JSON:
{{
  "salary_min": 1200000,
  "salary_max": 1800000,
  "currency": "INR",
  "factors": [
    "Node.js expertise commands premium in this market",
    "Startup at Series B — expect equity + lower base vs large corp"
  ],
  "negotiation_tip": "Lead with your AWS experience as a differentiator. Ask about equity vesting schedule early. Don't accept first offer — counter at salary_max."
}}

Use INR (Indian Rupees) for India-based roles, USD for US/international.
Base estimate on role seniority, skills required, and typical market rates.

Role: {state.get('jd_title', '')} at {state.get('jd_company', '')}
Must-have skills: {state.get('jd_must_have', [])}
Candidate fit: {state.get('fit_verdict', 'good_fit')} (score: {state.get('fit_score', 50)})
Culture signals: {state.get('jd_culture_signals', [])}

Resume experience excerpt:
{state.get('resume_text', '')[:800]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {
            "salary_min": 0, "salary_max": 0, "currency": "INR",
            "factors": [], "negotiation_tip": "Research market rates before negotiating.",
        }
    )

    return {
        "salary_min": int(result.get("salary_min", 0)),
        "salary_max": int(result.get("salary_max", 0)),
        "salary_currency": result.get("currency", "INR"),
        "salary_factors": result.get("factors", []),
        "negotiation_tip": result.get("negotiation_tip", ""),
        "logs": [f"💰 Salary range: {result.get('currency', 'INR')} {result.get('salary_min', 0):,} – {result.get('salary_max', 0):,}"],
    }


def strategy(state: dict) -> dict:
    """Node 5: Build application strategy with timing, referral, and LinkedIn tips."""
    llm = get_llm()

    fit_score = state.get("fit_score", 50)
    fit_verdict = state.get("fit_verdict", "stretch")
    red_flags = state.get("jd_red_flags", [])

    prompt = f"""Create a practical job application strategy for this candidate.
Return ONLY valid JSON:
{{
  "application_strategy": "Apply within 48 hours — this role has been up for 3 days. Your Node.js background is strong, but address the Kubernetes gap in cover letter proactively.",
  "timing_advice": "Apply Tuesday-Thursday morning for best recruiter visibility. Follow up via LinkedIn 5 days after applying.",
  "referral_tips": [
    "Search LinkedIn for 2nd-degree connections at {state.get('jd_company', 'the company')} — referrals 3x interview rate",
    "Look for ex-employees who can provide inside intel"
  ],
  "linkedin_tips": [
    "Add 'AWS' keyword to headline if it's buried in experience",
    "Pin a project that demonstrates Node.js at scale"
  ],
  "dos": [
    "Customize resume summary to mention the company name",
    "Quantify your Node.js experience (team size, traffic handled)"
  ],
  "donts": [
    "Don't apply with a generic resume — this role gets 200+ applications",
    "Don't skip the cover letter — they explicitly mentioned it in JD"
  ]
}}

Role: {state.get('jd_title', '')} at {state.get('jd_company', '')}
Fit: {fit_verdict} (score: {fit_score})
Red flags in JD: {red_flags}
Critical gaps: {state.get('critical_gaps', [])}
Competitive edge: {state.get('competitive_edge', [])}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {
            "application_strategy": "Apply soon and tailor your resume.",
            "timing_advice": "Apply during business hours for best visibility.",
            "referral_tips": [], "linkedin_tips": [], "dos": [], "donts": [],
        }
    )

    return {
        "application_strategy": result.get("application_strategy", ""),
        "timing_advice": result.get("timing_advice", ""),
        "referral_tips": result.get("referral_tips", []),
        "linkedin_tips": result.get("linkedin_tips", []),
        "application_dos": result.get("dos", []),
        "application_donts": result.get("donts", []),
        "logs": [f"🎯 Strategy built | {len(result.get('dos', []))} DOs, {len(result.get('donts', []))} DON'Ts"],
    }


def build_report(state: dict) -> dict:
    """Node 6: Assemble the final structured report."""
    fit_score = state.get("fit_score", 0)
    fit_verdict = state.get("fit_verdict", "stretch")

    report = {
        "fitScore": fit_score,
        "fitVerdict": fit_verdict,
        "matchSummary": state.get("match_summary", ""),
        "jd": {
            "title": state.get("jd_title", ""),
            "company": state.get("jd_company", ""),
            "mustHave": state.get("jd_must_have", []),
            "niceToHave": state.get("jd_nice_to_have", []),
            "responsibilities": state.get("jd_responsibilities", []),
            "redFlags": state.get("jd_red_flags", []),
            "cultureSignals": state.get("jd_culture_signals", []),
        },
        "match": {
            "competitiveEdge": state.get("competitive_edge", []),
            "criticalGaps": state.get("critical_gaps", []),
            "optionalGaps": state.get("optional_gaps", []),
        },
        "mockInterview": state.get("mock_questions", []),
        "salary": {
            "min": state.get("salary_min", 0),
            "max": state.get("salary_max", 0),
            "currency": state.get("salary_currency", "INR"),
            "factors": state.get("salary_factors", []),
            "negotiationTip": state.get("negotiation_tip", ""),
        },
        "strategy": {
            "overview": state.get("application_strategy", ""),
            "timing": state.get("timing_advice", ""),
            "referralTips": state.get("referral_tips", []),
            "linkedinTips": state.get("linkedin_tips", []),
            "dos": state.get("application_dos", []),
            "donts": state.get("application_donts", []),
        },
        "logs": state.get("logs", []),
    }

    return {
        "final_report": report,
        "logs": [f"🎉 Job Match report complete. Score: {fit_score}/100 — {fit_verdict.replace('_', ' ').title()}"],
    }
