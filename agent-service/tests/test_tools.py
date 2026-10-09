"""Tool registry: least-privilege access, timeouts, circuit breaker, MCP allowlist, GitHub fallbacks."""
import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

import agents.shared.tools as agent_tools
from agents.candidate_screening.nodes import fetch_github_data
from core import tools
from core.mcp_pool import pool
from core.tools import ToolNotAllowed, ToolUnavailable, call_tool, tool


@pytest.fixture
def temp_tool():
    """Register throwaway tools for a test and unregister them afterwards."""
    names = []

    def make(name, fn, **kwargs):
        names.append(name)
        return tool(name, description="test tool", agents={"tester"}, **kwargs)(fn)

    yield make
    for name in names:
        tools._REGISTRY.pop(name, None)


def test_agent_outside_allowlist_is_refused():
    with pytest.raises(ToolNotAllowed):
        asyncio.run(call_tool("github.repos_http", agent="faq", username="torvalds"))


def test_timeout_is_enforced(temp_tool):
    async def slow() -> str:
        await asyncio.sleep(5)
        return "late"

    temp_tool("t.slow", slow, timeout_s=0.05)
    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(call_tool("t.slow", agent="tester"))


def test_circuit_opens_after_repeated_failures_and_skips_the_call(temp_tool):
    calls = {"n": 0}

    async def flaky() -> str:
        calls["n"] += 1
        raise RuntimeError("down")

    temp_tool("t.flaky", flaky)
    for _ in range(3):
        with pytest.raises(RuntimeError):
            asyncio.run(call_tool("t.flaky", agent="tester"))
    with pytest.raises(ToolUnavailable):
        asyncio.run(call_tool("t.flaky", agent="tester"))
    assert calls["n"] == 3  # the 4th call never reached the dependency


def test_success_resets_failure_count(temp_tool):
    outcomes = iter([RuntimeError("x"), RuntimeError("x"), "ok", RuntimeError("x"), RuntimeError("x"), "ok"])

    async def sometimes() -> str:
        o = next(outcomes)
        if isinstance(o, Exception):
            raise o
        return o

    temp_tool("t.sometimes", sometimes)
    for _ in range(6):
        try:
            asyncio.run(call_tool("t.sometimes", agent="tester"))
        except RuntimeError:
            pass
    assert not tools._REGISTRY["t.sometimes"].breaker.is_open


def test_mcp_write_tools_are_blocked_before_reaching_the_server(monkeypatch):
    monkeypatch.setenv("GITHUB_PERSONAL_ACCESS_TOKEN", "x")
    for dangerous in ("create_repository", "push_files", "create_issue", "fork_repository"):
        with pytest.raises(PermissionError):
            asyncio.run(pool.call("github", dangerous, {}))
    assert pool._clients == {}  # no server process was started


def _fake_github(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(agent_tools.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_bad_github_token_falls_back_to_anonymous(monkeypatch):
    monkeypatch.setenv("GITHUB_PERSONAL_ACCESS_TOKEN", "expired")
    seen_auth = []

    def handler(request):
        seen_auth.append(request.headers.get("Authorization"))
        if request.headers.get("Authorization"):
            return httpx.Response(401, json={"message": "Bad credentials"})
        return httpx.Response(200, json=[
            {"name": "linux", "language": "C", "stargazers_count": 1, "description": "", "fork": False},
            {"name": "a-fork", "language": "C", "fork": True},
        ])

    _fake_github(monkeypatch, handler)
    repos = asyncio.run(call_tool("github.repos_http", agent="candidate_screening", username="torvalds"))
    assert [r["name"] for r in repos] == ["linux"]  # forks dropped
    assert seen_auth == ["token expired", None]


def test_screening_falls_back_from_mcp_to_http(monkeypatch):
    monkeypatch.setenv("GITHUB_PERSONAL_ACCESS_TOKEN", "tok")

    async def broken_mcp(server, tool_name, arguments):
        raise RuntimeError("mcp down")

    monkeypatch.setattr(pool, "call", broken_mcp)
    _fake_github(monkeypatch, lambda request: httpx.Response(200, json=[{"name": "api", "language": "Go"}]))

    out = asyncio.run(fetch_github_data({"extracted_github": "octocat"}))
    assert out["github_skill_match"] == ["Go"]
    assert "via HTTP (after MCP: RuntimeError)" in out["logs"][0]


def test_invalid_github_username_is_not_sent_anywhere(monkeypatch):
    called = []
    monkeypatch.setattr(agent_tools.httpx, "AsyncClient", lambda **kw: called.append(1))
    out = asyncio.run(fetch_github_data({"extracted_github": "../../admin"}))
    assert out["github_repos"] == [] and called == []


def test_tools_inventory_endpoint(monkeypatch):
    import main
    monkeypatch.setenv("AGENT_SECRET", "test-secret")
    with TestClient(main.app) as client:
        assert client.get("/tools").status_code == 401
        listed = client.get("/tools", headers={"x-agent-secret": "test-secret"}).json()["tools"]
    by_name = {t["name"]: t for t in listed}
    assert by_name["github.repos_http"]["agents"] == ["candidate_screening"]
    assert by_name["policy_docs.search"]["agents"] == ["faq"]
    # Nothing with side effects lives here; the one non-"read" tool runs code only inside the sandbox.
    assert {t["name"]: t["risk"] for t in listed if t["risk"] != "read"} == {"sandbox.run": "sandbox"}
    assert by_name["sandbox.run"]["agents"] == ["code_assessment"]
