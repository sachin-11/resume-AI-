"""
Auto Apply Agent — Nodes
"""
import os
from core.llm import get_llm, safe_json_parse
import agents.shared.tools  # noqa: F401  (registers the tools)
from core.tools import call_tool

async def search_jobs_node(state: dict) -> dict:
    """Node 1: Search live jobs based on target role and location using JSearch or Brave Search MCP."""
    role = state.get("target_role", "Software Engineer")
    loc = state.get("location", "Bangalore")
    limit = state.get("limit", 5)

    logs = [f"🔍 Starting job search for '{role}' in '{loc}' (limit: {limit})"]
    found_jobs = []
    jsearch_key = os.getenv("JSEARCH_API_KEY")
    jsearch_ready = bool(jsearch_key) and jsearch_key != "your_jsearch_api_key"
    configured = jsearch_ready or bool(os.getenv("BRAVE_SEARCH_API_KEY"))
    failed = False

    # 1. Try JSearch API (if API Key is configured)
    if jsearch_ready:
        try:
            logs.append("📡 Querying JSearch API for real-time listings...")
            found_jobs = await call_tool("jobs.jsearch", agent="auto_apply", query=f"{role} in {loc}", limit=limit)
            found_jobs = [{**j, "source": "jsearch"} for j in found_jobs]
            logs.append(f"✅ JSearch found {len(found_jobs)} jobs successfully.")
        except Exception as e:
            failed = True
            logs.append(f"⚠️ JSearch API query failed: {type(e).__name__}. Trying fallback...")

    # 2. Try Brave Search MCP fallback (if brave search key is set)
    if not found_jobs and os.getenv("BRAVE_SEARCH_API_KEY"):
        try:
            logs.append("🚀 [MCP] Searching the web via Brave Search MCP...")
            query = f"site:linkedin.com/jobs OR site:indeed.com/jobs '{role}' in '{loc}'"
            text_content = await call_tool("web.brave_search_mcp", agent="auto_apply", query=query)
            logs.append("✅ Brave Search MCP returned web results.")
            # Feed the search text to the LLM to parse job postings
            llm = get_llm()
            parse_prompt = f"""Extract up to {limit} job listings from these search results. Return ONLY valid JSON array:
[
  {{"jobTitle": "Role Name", "company": "Company", "location": "City", "jobUrl": "Link", "description": "Short summary"}}
]
Search Results:
{text_content[:3000]}"""
            response = await llm.ainvoke(parse_prompt)
            parsed = safe_json_parse(response.content if hasattr(response, 'content') else str(response), [])
            if isinstance(parsed, list):
                # The LLM can invent a company or link; a listing only counts if its
                # URL is literally in the search results it was extracted from.
                grounded = [
                    {**j, "source": "brave-search"} for j in parsed
                    if isinstance(j, dict) and j.get("jobUrl") and j["jobUrl"] in text_content
                ]
                dropped = len(parsed) - len(grounded)
                found_jobs = grounded[:limit]
                logs.append(f"✅ Extracted {len(found_jobs)} jobs via Brave Search MCP"
                            + (f" (dropped {dropped} not found in the search results)" if dropped else "") + ".")
        except Exception as e:
            failed = True
            logs.append(f"⚠️ Brave Search MCP failed: {type(e).__name__}.")

    # 3. Nothing found — say why. Never fabricate listings: they used to be saved
    #    to the user's job tracker as if they were real openings.
    if found_jobs:
        status, message = "ok", ""
    elif not configured:
        status = "not_configured"
        message = "No job-search source is configured — set JSEARCH_API_KEY (or BRAVE_SEARCH_API_KEY) to search live listings."
    elif failed:
        status, message = "failed", "Job search failed — please try again in a few minutes."
    else:
        status, message = "ok", f"No live listings matched '{role}' in '{loc}'."
    if message:
        logs.append(f"ℹ️ {message}")

    return {
        "found_jobs": found_jobs,
        "search_status": status,
        "search_message": message,
        "logs": logs
    }

async def match_and_score_node(state: dict) -> dict:
    """Node 2: Match resume against found jobs and assign fit score."""
    llm = get_llm()
    resume = state.get("resume_text", "")
    jobs = state.get("found_jobs", [])
    min_score = state.get("min_match_score", 60)

    logs = [f"📊 Matching resume against {len(jobs)} jobs (Minimum match threshold: {min_score}%)"]
    scored_jobs = []

    for job in jobs:
        prompt = f"""Compare this resume with the job description. Return ONLY a valid JSON:
{{
  "matchScore": 78,
  "matchedSkills": ["React", "Node.js"],
  "missingSkills": ["Docker", "AWS"],
  "hrEmail": "hr@company.com"
}}
(hrEmail: only an email address written in the job text itself; otherwise null. Never guess one.)

Job: {job.get('jobTitle')} at {job.get('company')}
Description: {job.get('description', '')[:1000]}

Resume Sample:
{resume[:1500]}"""

        try:
            response = await llm.ainvoke(prompt)
            res = safe_json_parse(response.content if hasattr(response, 'content') else str(response), {})
            
            score = int(res.get("matchScore", 50))
            hr_email = res.get("hrEmail") if isinstance(res.get("hrEmail"), str) else None
            
            # Enrich job structure
            scored_job = {
                **job,
                "matchScore": score,
                "matchedSkills": res.get("matchedSkills", []),
                "missingSkills": res.get("missingSkills", []),
                # Applications get emailed to this address — keep it only if the posting really contains it.
                "hrEmail": hr_email if hr_email and hr_email in job.get("description", "") else None,
                "status": "found" if score >= min_score else "skipped"
            }
            scored_jobs.append(scored_job)
            logs.append(f"  └─ {job.get('company')} ({job.get('jobTitle')}): Match Score {score}% ➔ {scored_job['status'].upper()}")
        except Exception as e:
            logs.append(f"  └─ ⚠️ Failed to score job at {job.get('company')}: {e}")

    return {
        "found_jobs": scored_jobs,
        "logs": logs
    }

async def tailor_resume_node(state: dict) -> dict:
    """Node 3: Tailor resume text specifically for the target job to match missing keywords."""
    llm = get_llm()
    resume = state.get("resume_text", "")
    
    # We select the highest matching job from found_jobs
    jobs = state.get("found_jobs", [])
    matched_jobs = [j for j in jobs if j.get("status") == "found"]
    
    if not matched_jobs:
        return {"logs": ["⏭️ No matching jobs passed threshold — skipping resume tailoring"]}
        
    target_job = max(matched_jobs, key=lambda x: x.get("matchScore", 0))
    logs = [f"✍️ Tailoring resume for highest match: '{target_job['jobTitle']}' at {target_job['company']}"]

    prompt = f"""Rewrite the professional summary and project bullets of this resume to highlight these matched skills: {target_job.get('matchedSkills')}
And seamlessly incorporate these missing skills if they fit: {target_job.get('missingSkills')}.
Keep it professional, truthful, and concise.

Resume:
{resume[:2000]}

Job Description:
{target_job.get('description', '')[:1000]}"""

    try:
        res = await llm.ainvoke(prompt)
        tailored_text = res.content if hasattr(res, 'content') else str(res)
        logs.append("✅ Resume tailored successfully.")
        return {
            "tailored_resumes": [{"job_id": target_job.get("jobTitle"), "tailored_text": tailored_text}],
            "logs": logs
        }
    except Exception as e:
        logs.append(f"⚠️ Tailoring failed: {e}")
        return {"logs": logs}

async def generate_cover_letter_node(state: dict) -> dict:
    """Node 4: Draft a highly customized cover letter."""
    llm = get_llm()
    resume = state.get("resume_text", "")
    
    jobs = state.get("found_jobs", [])
    matched_jobs = [j for j in jobs if j.get("status") == "found"]
    
    if not matched_jobs:
        return {"logs": ["⏭️ No matching jobs — skipping cover letter drafting"]}
        
    target_job = max(matched_jobs, key=lambda x: x.get("matchScore", 0))
    logs = [f"📧 Drafting Cover Letter for {target_job['company']}..."]

    prompt = f"""Write a compelling 3-paragraph cover letter applying for the role of '{target_job['jobTitle']}' at '{target_job['company']}'.
Match the qualifications in this resume to the job responsibilities.
Keep it extremely professional and tailored.

Job Title: {target_job['jobTitle']}
Company: {target_job['company']}
Job Details: {target_job.get('description', '')[:800]}

Candidate Background:
{resume[:1500]}"""

    try:
        res = await llm.ainvoke(prompt)
        letter = res.content if hasattr(res, 'content') else str(res)
        logs.append("✅ Cover letter compiled successfully.")
        return {
            "cover_letters": [{"job_id": target_job.get("jobTitle"), "cover_letter_text": letter}],
            "logs": logs
        }
    except Exception as e:
        logs.append(f"⚠️ Cover letter draft failed: {e}")
        return {"logs": logs}
