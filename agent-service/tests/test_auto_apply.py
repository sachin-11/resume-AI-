"""Auto-apply job search: no fabricated listings, LLM-extracted jobs must be grounded, no guessed HR emails."""
import asyncio
import json

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

import agents.auto_apply.nodes as nodes
from agents.auto_apply.nodes import match_and_score_node, search_jobs_node

STATE = {"target_role": "Backend Engineer", "location": "Pune", "limit": 5}


@pytest.fixture(autouse=True)
def no_search_keys(monkeypatch):
    monkeypatch.delenv("JSEARCH_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)


def fake_tool(monkeypatch, results: dict):
    async def call_tool(name, *, agent, **kwargs):
        value = results[name]
        if isinstance(value, Exception):
            raise value
        return value
    monkeypatch.setattr(nodes, "call_tool", call_tool)


def test_no_source_configured_returns_nothing_and_says_why():
    out = asyncio.run(search_jobs_node(STATE))
    assert out["found_jobs"] == []
    assert out["search_status"] == "not_configured"
    assert "JSEARCH_API_KEY" in out["search_message"]


def test_failed_search_is_reported_not_papered_over(monkeypatch):
    monkeypatch.setenv("JSEARCH_API_KEY", "k")
    fake_tool(monkeypatch, {"jobs.jsearch": RuntimeError("down")})
    out = asyncio.run(search_jobs_node(STATE))
    assert out["found_jobs"] == []
    assert out["search_status"] == "failed"


def test_jsearch_results_are_tagged_with_their_source(monkeypatch):
    monkeypatch.setenv("JSEARCH_API_KEY", "k")
    fake_tool(monkeypatch, {"jobs.jsearch": [{"jobTitle": "BE", "company": "Acme", "jobUrl": "https://acme.dev/1"}]})
    out = asyncio.run(search_jobs_node(STATE))
    assert out["search_status"] == "ok"
    assert out["found_jobs"][0]["source"] == "jsearch"


def test_brave_listings_must_appear_in_the_search_results(monkeypatch):
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "k")
    fake_tool(monkeypatch, {"web.brave_search_mcp": "Backend Engineer at Acme https://jobs.acme.dev/42 apply now"})
    extracted = [
        {"jobTitle": "Backend Engineer", "company": "Acme", "jobUrl": "https://jobs.acme.dev/42"},
        {"jobTitle": "Lead Engineer", "company": "Invented Corp", "jobUrl": "https://invented.example/7"},
    ]
    monkeypatch.setattr(nodes, "get_llm", lambda *a, **k: FakeListChatModel(responses=[json.dumps(extracted)]))

    out = asyncio.run(search_jobs_node(STATE))
    assert [j["company"] for j in out["found_jobs"]] == ["Acme"]
    assert out["found_jobs"][0]["source"] == "brave-search"
    assert any("dropped 1" in line for line in out["logs"])


@pytest.mark.parametrize("description,llm_email,expected", [
    ("Send your CV to talent@acme.dev", "talent@acme.dev", "talent@acme.dev"),
    ("Apply on our site", "hr@acme.dev", None),                 # guessed — not in the posting
    ("Apply on our site", None, None),
])
def test_hr_email_only_if_written_in_the_posting(monkeypatch, description, llm_email, expected):
    reply = json.dumps({"matchScore": 80, "matchedSkills": [], "missingSkills": [], "hrEmail": llm_email})
    monkeypatch.setattr(nodes, "get_llm", lambda *a, **k: FakeListChatModel(responses=[reply]))
    out = asyncio.run(match_and_score_node({
        "resume_text": "cv", "min_match_score": 60,
        "found_jobs": [{"jobTitle": "BE", "company": "Acme", "description": description}],
    }))
    assert out["found_jobs"][0]["hrEmail"] == expected
