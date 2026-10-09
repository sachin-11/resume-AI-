"""
The tools agents can call — all registered in core.tools (risk, allowed agents,
timeout, circuit breaker, tracing). Call them via `call_tool(name, agent=..., ...)`.
"""
import asyncio
import json
import logging
import os
from typing import Optional

import httpx

from core.mcp_pool import pool
from core.tools import ToolError, tool

logger = logging.getLogger("agent.tools")


def _mcp_text(result: dict) -> str:
    return "".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")


def _simplify_repos(repos: list) -> list[dict]:
    return [
        {
            "name": r.get("name", ""),
            "language": r.get("language") or "",
            "stars": r.get("stargazers_count", r.get("stars", 0)),
            "description": (r.get("description") or "")[:100],
            "topics": r.get("topics", []),
        }
        for r in repos if not r.get("fork", False)
    ]


# ── GitHub (candidate screening: verify claimed skills against public repos) ──

@tool("github.repos_mcp", agents={"candidate_screening"}, timeout_s=20,
      description="A GitHub user's public repositories, via the GitHub MCP server (read-only tool allowlist).")
async def github_repos_mcp(username: str) -> list:
    # The server has no per-user listing tool; a `user:` search returns the same repos.
    result = await pool.call("github", "search_repositories", {"query": f"user:{username}", "perPage": 10})
    data = json.loads(_mcp_text(result))
    return _simplify_repos(data.get("items", []))


@tool("github.repos_http", agents={"candidate_screening"}, timeout_s=10,
      description="A GitHub user's public repositories, via the GitHub REST API.")
async def github_repos_http(username: str) -> list:
    token = os.getenv("GITHUB_PERSONAL_ACCESS_TOKEN") or os.getenv("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "Resume-AI-Coach-Agent"}
    params = {"sort": "updated", "per_page": 10}
    url = f"https://api.github.com/users/{username}/repos"
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, params=params, headers={**headers, **({"Authorization": f"token {token}"} if token else {})})
        if res.status_code == 401 and token:
            # Public data doesn't need auth — a bad/expired token shouldn't break screening.
            logger.warning("GitHub token rejected (401) — retrying unauthenticated; fix GITHUB_PERSONAL_ACCESS_TOKEN")
            res = await client.get(url, params=params, headers=headers)
    if res.status_code == 404:
        return []
    if res.status_code != 200:
        raise ToolError(f"GitHub API returned {res.status_code}")
    return _simplify_repos(res.json())


# ── Calendar (scheduler, opt-in) ─────────────────────────────────

@tool("calendar.free_slots_mcp", agents={"scheduler"}, timeout_s=20,
      description="Free interview slots from a configured calendar MCP server.")
async def calendar_free_slots_mcp(timeframe: str, timezone: str) -> list:
    tool_name = os.getenv("GOOGLE_CALENDAR_MCP_TOOL_NAME", "find_free_slots")
    result = await pool.call("calendar", tool_name, {"timeframe": timeframe, "timezone": timezone})
    parsed = json.loads(_mcp_text(result))
    return parsed if isinstance(parsed, list) else []


# ── Job search (auto-apply) ──────────────────────────────────────

@tool("jobs.jsearch", agents={"auto_apply"}, timeout_s=15,
      description="Live job listings from the JSearch API.")
async def jobs_jsearch(query: str, limit: int) -> list:
    key = os.getenv("JSEARCH_API_KEY")
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            "https://jsearch.p.rapidapi.com/search",
            headers={"X-RapidAPI-Key": key or "", "X-RapidAPI-Host": "jsearch.p.rapidapi.com"},
            params={"query": query, "page": "1", "num_pages": "1"},
        )
    if res.status_code != 200:
        raise ToolError(f"JSearch returned {res.status_code}")
    return [
        {
            "jobTitle": j.get("job_title", ""),
            "company": j.get("job_publisher", j.get("employer_name", "Unknown")),
            "location": f"{j.get('job_city', '')}, {j.get('job_country', '')}".strip(", "),
            "jobUrl": j.get("job_apply_link", ""),
            "salary": j.get("job_min_salary") or "Not disclosed",
            "jobType": j.get("job_employment_type", "Full-time"),
            "description": j.get("job_description", ""),
        }
        for j in res.json().get("data", [])[:limit]
    ]


@tool("web.brave_search_mcp", agents={"auto_apply"}, timeout_s=20,
      description="Web search results via the Brave Search MCP server.")
async def web_brave_search_mcp(query: str) -> str:
    return _mcp_text(await pool.call("brave", "brave_web_search", {"query": query}))


# ── Company policy docs (FAQ, RAG) ───────────────────────────────

@tool("policy_docs.search", agents={"faq"}, timeout_s=15,
      description="Most relevant company policy-document chunks for a question (Pinecone).")
async def policy_docs_search(query: str, top_k: Optional[int] = None) -> list:
    from agents.faq.store import retrieve_policy_chunks_sync
    # Embedding + Pinecone clients are blocking — keep them off the event loop.
    return await asyncio.to_thread(retrieve_policy_chunks_sync, query, top_k)


# ── Code sandbox (coding interviews): AWS Bedrock AgentCore Code Interpreter ──

@tool("sandbox.run", agents={"code_assessment"}, risk="sandbox", timeout_s=90,
      description="Run a command over the given files in a fresh, network-less AgentCore Code Interpreter session.")
async def sandbox_run(files: dict, command: str, timeout_s: int = 8) -> dict:
    from agents.code_assessment.sandbox import run
    return await run(files, command, timeout_s=min(int(timeout_s), 30))
