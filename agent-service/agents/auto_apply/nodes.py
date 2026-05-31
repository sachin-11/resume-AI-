"""
Auto Apply Agent — Nodes
"""
import os
import json
import httpx
import asyncio
from agents.shared.llm import get_llm, safe_json_parse
from agents.shared.mcp_client import StdioMCPClient

async def search_jobs_node(state: dict) -> dict:
    """Node 1: Search live jobs based on target role and location using JSearch or Brave Search MCP."""
    role = state.get("target_role", "Software Engineer")
    loc = state.get("location", "Bangalore")
    limit = state.get("limit", 5)

    logs = [f"🔍 Starting job search for '{role}' in '{loc}' (limit: {limit})"]
    found_jobs = []

    # 1. Try JSearch API (if API Key is configured)
    jsearch_key = os.getenv("JSEARCH_API_KEY")
    if jsearch_key and jsearch_key != "your_jsearch_api_key":
        try:
            logs.append("📡 Querying JSearch API for real-time listings...")
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.get(
                    "https://jsearch.p.rapidapi.com/search",
                    headers={
                        "X-RapidAPI-Key": jsearch_key,
                        "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
                    },
                    params={
                        "query": f"{role} in {loc}",
                        "page": "1",
                        "num_pages": "1"
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    jobs = data.get("data", [])
                    for j in jobs[:limit]:
                        found_jobs.append({
                            "jobTitle": j.get("job_title", ""),
                            "company": j.get("job_publisher", j.get("employer_name", "Unknown")),
                            "location": f"{j.get('job_city', '')}, {j.get('job_country', '')}".strip(", "),
                            "jobUrl": j.get("job_apply_link", ""),
                            "salary": j.get("job_min_salary") or "Not disclosed",
                            "jobType": j.get("job_employment_type", "Full-time"),
                            "description": j.get("job_description", "")
                        })
                    logs.append(f"✅ JSearch found {len(found_jobs)} jobs successfully.")
        except Exception as e:
            logs.append(f"⚠️ JSearch API query failed: {e}. Trying fallback...")

    # 2. Try Brave Search MCP fallback (if brave search key is set)
    brave_key = os.getenv("BRAVE_SEARCH_API_KEY")
    if not found_jobs and brave_key:
        try:
            logs.append("🚀 [MCP] Initializing Brave Search MCP Server...")
            env = os.environ.copy()
            env["BRAVE_SEARCH_API_KEY"] = brave_key
            client = StdioMCPClient("npx", ["-y", "@modelcontextprotocol/server-brave-search"], env=env)
            if await client.initialize():
                query = f"site:linkedin.com/jobs OR site:indeed.com/jobs '{role}' in '{loc}'"
                mcp_res = await client.call_tool("brave_web_search", {"query": query})
                await client.close()
                
                content_list = mcp_res.get("content", [])
                text_content = "".join([c.get("text", "") for c in content_list if c.get("type") == "text"])
                
                logs.append("✅ Brave Search MCP successfully scraped search web results.")
                # Feed the search text to the LLM to parse job postings
                llm = get_llm()
                parse_prompt = f"""Extract up to {limit} job listings from these search results. Return ONLY valid JSON array:
[
  {{"jobTitle": "Role Name", "company": "Company", "location": "City", "jobUrl": "Link", "description": "Short summary"}}
]
Search Results:
{text_content[:3000]}"""
                response = llm.invoke(parse_prompt)
                parsed = safe_json_parse(response.content if hasattr(response, 'content') else str(response), [])
                if isinstance(parsed, list):
                    found_jobs = parsed[:limit]
                    logs.append(f"✅ Scraped {len(found_jobs)} jobs via Brave Search MCP.")
        except Exception as e:
            logs.append(f"⚠️ Brave Search MCP failed: {e}. Loading fallback mock listings...")

    # 3. Dynamic Mock Fallback (so it ALWAYS works out-of-the-box with beautiful results)
    if not found_jobs:
        logs.append("ℹ️ No search API/MCP key configured. Generating highly realistic local listings for testing...")
        found_jobs = [
            {
                "jobTitle": f"Senior {role}",
                "company": "TechVanguard Solutions",
                "location": loc,
                "jobUrl": "https://linkedin.com/jobs/view/techvanguard-dev",
                "salary": "₹15,00,000 - ₹22,00,000",
                "jobType": "Full-time",
                "description": f"We are hiring a Senior {role} skilled in React, Node.js, Python, and system architectures. 3+ years experience required."
            },
            {
                "jobTitle": f"Lead {role} (Remote)",
                "company": "Cognitive AI Systems",
                "location": "Remote (India)",
                "jobUrl": "https://indeed.com/view/cognitive-ai-lead",
                "salary": "₹24,00,000 - ₹32,00,000",
                "jobType": "Full-time",
                "description": "Looking for a seasoned practitioner to lead our AI and Full-stack engineering squads. Expertise in Python, LLMs, next.js, and cloud platforms is mandatory."
            }
        ]
        logs.append(f"✅ Generated {len(found_jobs)} matching mock job opportunities.")

    return {
        "found_jobs": found_jobs,
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
(If no explicit HR email is in the job text, suggest a generic one like recruitment@company.com or return null)

Job: {job.get('jobTitle')} at {job.get('company')}
Description: {job.get('description', '')[:1000]}

Resume Sample:
{resume[:1500]}"""

        try:
            response = llm.invoke(prompt)
            res = safe_json_parse(response.content if hasattr(response, 'content') else str(response), {})
            
            score = int(res.get("matchScore", 50))
            
            # Enrich job structure
            scored_job = {
                **job,
                "matchScore": score,
                "matchedSkills": res.get("matchedSkills", []),
                "missingSkills": res.get("missingSkills", []),
                "hrEmail": res.get("hrEmail") or f"careers@{job.get('company', 'company').lower().replace(' ', '')}.com",
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
        res = llm.invoke(prompt)
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
        res = llm.invoke(prompt)
        letter = res.content if hasattr(res, 'content') else str(res)
        logs.append("✅ Cover letter compiled successfully.")
        return {
            "cover_letters": [{"job_id": target_job.get("jobTitle"), "cover_letter_text": letter}],
            "logs": logs
        }
    except Exception as e:
        logs.append(f"⚠️ Cover letter draft failed: {e}")
        return {"logs": logs}
