"""Run history: every run_agent call leaves a row; /admin/runs summarises a time window."""
import asyncio
import time
from datetime import datetime, timedelta, timezone
from typing import TypedDict

import jwt
import pytest
from fastapi.testclient import TestClient
from langgraph.graph import END, StateGraph

from core import guards, metrics, runlog
from core.auth import AUDIENCE, ISSUER
from core.observability import run_agent

SECRET = "test-secret"


def bearer(role: str) -> dict:
    now = int(time.time())
    tok = jwt.encode({"iss": ISSUER, "aud": AUDIENCE, "sub": "u1", "role": role, "iat": now, "exp": now + 120},
                     SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(autouse=True)
def clean():
    runlog.reset_for_tests()
    metrics.reset_for_tests()
    guards._breakers.clear()
    yield
    runlog.reset_for_tests()
    guards._breakers.clear()


class S(TypedDict, total=False):
    x: int


def graph(fn):
    g = StateGraph(S)
    g.add_node("work", fn)
    g.set_entry_point("work")
    g.add_edge("work", END)
    return g.compile()


async def ok(state):
    return {"x": 1}


async def boom(state):
    raise RuntimeError("down")


def test_runs_are_recorded_and_summarised():
    async def scenario():
        await run_agent("screen-candidate", graph(ok), {})
        await run_agent("screen-candidate", graph(ok), {})
        with pytest.raises(RuntimeError):
            await run_agent("job-match", graph(boom), {})
        await asyncio.sleep(0)          # let the fire-and-forget inserts run
        return await runlog.summary(7)

    s = asyncio.run(scenario())
    assert s["totals"]["runs"] == 3 and s["totals"]["failed"] == 1
    assert len(s["daily"]) == 7 and s["daily"][-1]["ok"] == 2 and s["daily"][-1]["failed"] == 1
    assert [a["agent"] for a in s["agents"]] == ["screen-candidate", "job-match"]
    assert s["agents"][1]["error_rate"] == 1.0
    assert s["recent_failures"][0]["agent"] == "job-match" and s["recent_failures"][0]["status"] == "error"
    assert s["statuses"] == {"ok": 2, "error": 1}


def test_window_excludes_older_runs_and_keeps_empty_days():
    old = datetime.now(timezone.utc) - timedelta(days=10)
    runlog._memory.append({"at": old, "agent": "daily-ops", "status": "ok", "ms": 5, "calls": 1, "input_tokens": 1,
                           "output_tokens": 1, "cost_usd": 0.1, "version": "v", "variant": "stable",
                           "user_id": None, "org_id": None, "request_id": "r"})
    s = asyncio.run(runlog.summary(7))
    assert s["totals"]["runs"] == 0 and len(s["daily"]) == 7
    assert all(d["ok"] == 0 and d["p95_ms"] is None for d in s["daily"])


def test_endpoint_is_admin_only(monkeypatch):
    import main
    monkeypatch.setenv("AGENT_SECRET", SECRET)
    with TestClient(main.app) as client:
        assert client.get("/admin/runs", headers=bearer("recruiter")).status_code == 403
        res = client.get("/admin/runs?days=500", headers=bearer("admin"))
        assert res.status_code == 200 and res.json()["days"] == runlog.RETENTION_DAYS
