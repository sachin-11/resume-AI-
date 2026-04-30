"""
Resume Improvement Agent — Nodes

Each function = one node in the LangGraph graph.
Nodes receive the current state, do work, return updated state fields.
"""

import json
import os
from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from agent.state import ResumeImprovementState


# ── LLM Setup (OpenAI primary, Groq fallback) ───────────────────
def get_llm(temperature: float = 0.3) -> Any:
    """Get LLM — OpenAI if key available, else Groq."""
    if os.getenv("OPENAI_API_KEY"):
        return ChatOpenAI(
            model="gpt-4o-mini",
            temperature=temperature,
            api_key=os.getenv("OPENAI_API_KEY"),
        )
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=temperature,
        api_key=os.getenv("GROQ_API_KEY"),
    )


def safe_json_parse(text: str, fallback: Any) -> Any:
    """Parse JSON from LLM response, handling markdown code blocks."""
    try:
        # Strip markdown code blocks if present
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        return json.loads(text.strip())
    except Exception:
        return fallback


# ── Node 1: Analyze Resume ───────────────────────────────────────
def analyze_resume(state: ResumeImprovementState) -> dict:
    """
    Node 1: Deep analysis of the resume.
    Extracts skills, scores ATS quality, identifies weak sections.
    """
    llm = get_llm()
    role_context = f"Target role: {state['target_role']}" if state.get("target_role") else ""
    jd_context = f"\nJob Description:\n{state['job_description'][:1500]}" if state.get("job_description") else ""

    prompt = f"""Analyze this resume and return ONLY valid JSON:
{{
  "ats_score": 65,
  "skills": ["React", "Node.js", "PostgreSQL"],
  "missing_skills": ["Docker", "TypeScript", "AWS"],
  "weak_sections": ["summary", "experience_bullets"],
  "strengths": ["Good project portfolio", "Relevant tech stack"],
  "experience_level": "mid",
  "detected_role": "Full Stack Developer"
}}

ats_score: 0-100 (how ATS-friendly is this resume right now)
weak_sections: list from ["summary", "experience_bullets", "skills_section", "education", "projects"]

{role_context}{jd_context}

Resume:
{state['resume_text'][:3000]}"""

    response = llm.invoke([
        SystemMessage(content="You are an expert ATS resume analyst. Return only valid JSON."),
        HumanMessage(content=prompt)
    ])

    result = safe_json_parse(response.content, {
        "ats_score": 50, "skills": [], "missing_skills": [],
        "weak_sections": ["summary", "experience_bullets"],
        "strengths": [], "experience_level": "mid", "detected_role": "Developer"
    })

    score = int(result.get("ats_score", 50))

    return {
        "initial_score": score,
        "current_score": score,
        "skills": result.get("skills", []),
        "missing_skills": result.get("missing_skills", []),
        "weak_sections": result.get("weak_sections", []),
        "strengths": result.get("strengths", []),
        "iteration": 0,
        "logs": [f"✅ Analysis complete. Initial ATS score: {score}/100. Weak sections: {result.get('weak_sections', [])}"]
    }


# ── Node 2: Identify Specific Gaps ──────────────────────────────
def identify_gaps(state: ResumeImprovementState) -> dict:
    """
    Node 2: Pinpoint exactly what needs to change.
    More specific than analysis — gives actionable rewrite targets.
    """
    llm = get_llm()

    prompt = f"""Based on this resume analysis, identify SPECIFIC gaps to fix.
Return ONLY valid JSON:
{{
  "priority_fixes": [
    {{
      "section": "summary",
      "issue": "Too generic, no keywords, no value proposition",
      "fix": "Add target role title, top 3 skills, years of experience, key achievement"
    }},
    {{
      "section": "experience_bullets",
      "issue": "Bullets describe duties not achievements",
      "fix": "Rewrite with STAR format: action verb + metric + impact"
    }}
  ],
  "keywords_to_add": ["Docker", "CI/CD", "TypeScript"],
  "quick_wins": ["Add LinkedIn URL", "Add GitHub link", "Quantify at least 3 achievements"]
}}

Current score: {state['current_score']}/100
Weak sections: {state['weak_sections']}
Missing skills: {state['missing_skills']}
Target role: {state.get('target_role', 'Not specified')}

Resume (first 2000 chars):
{state['resume_text'][:2000]}"""

    response = llm.invoke([
        SystemMessage(content="You are a resume coach. Return only valid JSON."),
        HumanMessage(content=prompt)
    ])

    result = safe_json_parse(response.content, {
        "priority_fixes": [], "keywords_to_add": [], "quick_wins": []
    })

    return {
        "logs": [f"🔍 Identified {len(result.get('priority_fixes', []))} priority fixes. Keywords to add: {result.get('keywords_to_add', [])}"],
        # Store in improvement_report for later
        "improvement_report": {
            **state.get("improvement_report", {}),
            "priority_fixes": result.get("priority_fixes", []),
            "quick_wins": result.get("quick_wins", []),
        }
    }


# ── Node 3: Rewrite Sections ─────────────────────────────────────
def rewrite_sections(state: ResumeImprovementState) -> dict:
    """
    Node 3: Actually rewrite the weak sections.
    This is the core improvement step — can loop up to max_iterations times.
    """
    llm = get_llm(temperature=0.5)
    iteration = state.get("iteration", 0) + 1

    role = state.get("target_role", "Software Developer")
    jd_snippet = state.get("job_description", "")[:800] if state.get("job_description") else ""

    prompt = f"""Rewrite the weak parts of this resume to improve ATS score.
Return ONLY valid JSON:
{{
  "improved_summary": "Rewritten professional summary — 3-4 sentences, keyword-rich, role-specific",
  "improved_bullets": [
    {{
      "section": "Experience",
      "company": "Company name",
      "original": "Worked on backend APIs",
      "improved": "Architected and deployed 15+ RESTful APIs using Node.js, reducing response time by 40%",
      "reason": "Added metrics, action verb, specific technology"
    }}
  ],
  "keywords_added": ["Docker", "CI/CD", "TypeScript"],
  "title_suggestion": "Senior Full Stack Developer"
}}

Rules:
- Rewrite 3-5 most impactful bullets
- Add missing keywords naturally (no stuffing)
- Use strong action verbs: Built, Architected, Optimized, Led, Reduced, Increased
- Add numbers/metrics where possible
- Keep truthful — only rephrase, don't fabricate

Target Role: {role}
Missing Skills to incorporate: {state.get('missing_skills', [])}
Iteration: {iteration} of {state.get('max_iterations', 3)}
{f'Job Description context: {jd_snippet}' if jd_snippet else ''}

Resume:
{state['resume_text'][:2500]}"""

    response = llm.invoke([
        SystemMessage(content="You are an expert resume writer. Return only valid JSON."),
        HumanMessage(content=prompt)
    ])

    result = safe_json_parse(response.content, {
        "improved_summary": "", "improved_bullets": [],
        "keywords_added": [], "title_suggestion": role
    })

    return {
        "improved_summary": result.get("improved_summary", ""),
        "improved_bullets": result.get("improved_bullets", []),
        "keywords_added": result.get("keywords_added", []),
        "title_suggestion": result.get("title_suggestion", role),
        "iteration": iteration,
        "logs": [f"✍️ Iteration {iteration}: Rewrote {len(result.get('improved_bullets', []))} bullets. Keywords added: {result.get('keywords_added', [])}"]
    }


# ── Node 4: Score Check ──────────────────────────────────────────
def score_check(state: ResumeImprovementState) -> dict:
    """
    Node 4: Re-score the resume after rewrites.
    This determines if we loop back or proceed to finalize.
    """
    llm = get_llm()

    # Build improved resume text for re-scoring
    improved_text = state['resume_text']
    if state.get("improved_summary"):
        improved_text = f"SUMMARY: {state['improved_summary']}\n\n" + improved_text
    if state.get("improved_bullets"):
        bullets_text = "\n".join([f"• {b['improved']}" for b in state.get("improved_bullets", [])])
        improved_text += f"\n\nIMPROVED BULLETS:\n{bullets_text}"

    prompt = f"""Score this improved resume for ATS compatibility.
Return ONLY: {{"new_score": 78, "improvement_reason": "Added keywords, better bullets"}}

Target role: {state.get('target_role', 'Software Developer')}
Keywords added: {state.get('keywords_added', [])}

Improved Resume:
{improved_text[:2500]}"""

    response = llm.invoke([
        SystemMessage(content="You are an ATS scoring system. Return only valid JSON."),
        HumanMessage(content=prompt)
    ])

    result = safe_json_parse(response.content, {"new_score": state["current_score"] + 5})
    new_score = int(result.get("new_score", state["current_score"] + 5))

    return {
        "current_score": new_score,
        "logs": [f"📊 Score check iteration {state.get('iteration', 1)}: {state['current_score']} → {new_score}/100"]
    }


# ── Node 5: Finalize Report ──────────────────────────────────────
def finalize_report(state: ResumeImprovementState) -> dict:
    """
    Node 5: Build the final improvement report to send back to Next.js.
    """
    score_improvement = state["current_score"] - state["initial_score"]

    report = {
        "resumeId": state["resume_id"],
        "initialScore": state["initial_score"],
        "finalScore": state["current_score"],
        "scoreImprovement": score_improvement,
        "iterations": state.get("iteration", 1),
        "improvedSummary": state.get("improved_summary", ""),
        "improvedBullets": state.get("improved_bullets", []),
        "keywordsAdded": state.get("keywords_added", []),
        "titleSuggestion": state.get("title_suggestion", ""),
        "strengths": state.get("strengths", []),
        "missingSkills": state.get("missing_skills", []),
        "priorityFixes": state.get("improvement_report", {}).get("priority_fixes", []),
        "quickWins": state.get("improvement_report", {}).get("quick_wins", []),
        "logs": state.get("logs", []),
        "status": "completed"
    }

    return {
        "improvement_report": report,
        "logs": [f"🎉 Done! Score improved from {state['initial_score']} → {state['current_score']} (+{score_improvement} points) in {state.get('iteration', 1)} iteration(s)"]
    }
