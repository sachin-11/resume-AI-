"""
Market Intelligence Agent — Graph

Resume → Skills Extract → Market Demand Analysis → Salary Insights → Action Plan → END
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Optional, Annotated
import operator
from agents.shared.llm import get_llm, safe_json_parse


class MarketIntelligenceState(TypedDict):
    # Input
    resume_text: str
    target_role: Optional[str]
    location: str                  # e.g. "Bangalore", "Remote"
    experience_years: int

    # Analysis
    current_skills: List[str]
    market_demand_skills: List[str]   # skills in high demand
    skill_gaps: List[str]             # skills to learn for market
    salary_range: dict                # {min, max, currency, location}
    demand_score: int                 # how in-demand is this profile (0-100)

    # Output
    market_report: dict
    action_plan: List[dict]

    logs: Annotated[List[str], operator.add]


def analyze_market_demand(state: MarketIntelligenceState) -> dict:
    """Node 1: Analyze current market demand for candidate's skills."""
    llm = get_llm()

    prompt = f"""Analyze the job market demand for this candidate profile in {state.get('location', 'India')}.
Use your knowledge of current tech job market (2024-2025).
Return ONLY valid JSON:
{{
  "current_skills": ["Node.js", "React", "PostgreSQL"],
  "market_demand_skills": ["TypeScript", "Kubernetes", "System Design"],
  "skill_gaps": ["TypeScript", "Docker", "Kafka"],
  "demand_score": 72,
  "market_summary": "Strong demand for Node.js developers in India, especially with TypeScript",
  "trending_skills": ["AI/ML integration", "LLMs", "Vector databases"],
  "declining_skills": ["jQuery", "AngularJS"]
}}

demand_score: 0-100 (how in-demand is this exact profile right now)

Target Role: {state.get('target_role', 'Software Developer')}
Experience: {state.get('experience_years', 3)} years
Location: {state.get('location', 'India')}

Resume:
{state.get('resume_text', '')[:2000]}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"current_skills": [], "market_demand_skills": [], "skill_gaps": [], "demand_score": 60}
    )

    return {
        "current_skills": result.get("current_skills", []),
        "market_demand_skills": result.get("market_demand_skills", []),
        "skill_gaps": result.get("skill_gaps", []),
        "demand_score": int(result.get("demand_score", 60)),
        "logs": [f"📈 Market demand score: {result.get('demand_score', 60)}/100"]
    }


def estimate_salary(state: MarketIntelligenceState) -> dict:
    """Node 2: Estimate salary range based on skills and market."""
    llm = get_llm()

    prompt = f"""Estimate realistic salary range for this profile in {state.get('location', 'India')}.
Use current 2024-2025 market data.
Return ONLY valid JSON:
{{
  "salary_range": {{
    "min": 1200000,
    "max": 2000000,
    "currency": "INR",
    "period": "annual",
    "location": "Bangalore"
  }},
  "salary_factors": [
    "Node.js expertise commands premium",
    "7 years experience is senior level"
  ],
  "salary_boost_skills": [
    {{"skill": "TypeScript", "boost_percent": 15}},
    {{"skill": "System Design", "boost_percent": 20}}
  ],
  "market_percentile": 65
}}

Role: {state.get('target_role', 'Software Developer')}
Experience: {state.get('experience_years', 3)} years
Skills: {state.get('current_skills', [])}
Location: {state.get('location', 'India')}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"salary_range": {"min": 800000, "max": 1500000, "currency": "INR", "period": "annual"}}
    )

    return {
        "salary_range": result.get("salary_range", {}),
        "logs": [f"💰 Salary estimate: {result.get('salary_range', {}).get('min', 0):,} - {result.get('salary_range', {}).get('max', 0):,} {result.get('salary_range', {}).get('currency', 'INR')}"]
    }


def build_action_plan(state: MarketIntelligenceState) -> dict:
    """Node 3: Build actionable market improvement plan."""
    llm = get_llm()

    prompt = f"""Create a market positioning action plan for this candidate.
Return ONLY valid JSON:
{{
  "action_plan": [
    {{
      "action": "Learn TypeScript",
      "impact": "15% salary increase potential",
      "timeframe": "4-6 weeks",
      "priority": "high",
      "resources": ["TypeScript official docs", "Matt Pocock's Total TypeScript"]
    }}
  ],
  "positioning_statement": "How to position yourself in the market",
  "top_companies_hiring": ["Zepto", "Swiggy", "Razorpay", "CRED"],
  "interview_tips": ["Focus on system design", "Prepare DSA basics"]
}}

Skill gaps: {state.get('skill_gaps', [])}
Market demand skills: {state.get('market_demand_skills', [])}
Current demand score: {state.get('demand_score', 60)}/100
Role: {state.get('target_role', 'Developer')}
Location: {state.get('location', 'India')}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"action_plan": [], "positioning_statement": "", "top_companies_hiring": [], "interview_tips": []}
    )

    market_report = {
        "targetRole": state.get("target_role", ""),
        "location": state.get("location", ""),
        "experienceYears": state.get("experience_years", 0),
        "demandScore": state.get("demand_score", 60),
        "currentSkills": state.get("current_skills", []),
        "marketDemandSkills": state.get("market_demand_skills", []),
        "skillGaps": state.get("skill_gaps", []),
        "salaryRange": state.get("salary_range", {}),
        "actionPlan": result.get("action_plan", []),
        "positioningStatement": result.get("positioning_statement", ""),
        "topCompaniesHiring": result.get("top_companies_hiring", []),
        "interviewTips": result.get("interview_tips", []),
        "logs": state.get("logs", []),
    }

    return {
        "action_plan": result.get("action_plan", []),
        "market_report": market_report,
        "logs": [f"✅ Market intelligence report ready. {len(result.get('action_plan', []))} action items"]
    }


def build_market_intelligence_agent():
    workflow = StateGraph(MarketIntelligenceState)

    workflow.add_node("analyze_market", analyze_market_demand)
    workflow.add_node("estimate_salary", estimate_salary)
    workflow.add_node("build_action_plan", build_action_plan)

    workflow.set_entry_point("analyze_market")
    workflow.add_edge("analyze_market",   "estimate_salary")
    workflow.add_edge("estimate_salary",  "build_action_plan")
    workflow.add_edge("build_action_plan", END)

    return workflow.compile()


market_intelligence_agent = build_market_intelligence_agent()
