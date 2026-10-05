"""Background jobs: submit → progress → result, ownership, idempotency, crash recovery, rate limits."""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from pydantic import BaseModel

import core.llm
import core.ratelimit
from core import jobs
from core.auth import AUDIENCE, ISSUER, Caller

SECRET = "test-secret"


def bearer(sub: str) -> dict:
    now = int(time.time())
    tok = jwt.encode({"iss": ISSUER, "aud": AUDIENCE, "sub": sub, "iat": now, "exp": now + 120}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {tok}"}


SCREEN_INPUT = {"resume_text": "x" * 60, "job_description": "Backend", "candidate_name": "Asha"}


@pytest.fixture
def client(monkeypatch):
    import main
    monkeypatch.setenv("AGENT_SECRET", SECRET)
    model = FakeListChatModel(responses=[
        '{"skills": ["Python"], "github_username": null}',
        '{"match_score": 81, "screening_decision": "shortlist"}',
    ])
    monkeypatch.setattr(core.llm, "get_llm", lambda temperature=0.3, tier="reasoning": model)
    with TestClient(main.app) as c:
        yield c


def wait_for(client, job_id, headers, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/jobs/{job_id}", headers=headers).json()
        if job["status"] in ("succeeded", "failed"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"job still {job['status']}")


def test_job_runs_in_background_with_progress(client):
    submitted = client.post("/jobs", headers=bearer("u1"), json={"agent": "screen-candidate", "input": SCREEN_INPUT})
    assert submitted.status_code == 202
    job = wait_for(client, submitted.json()["job_id"], bearer("u1"))

    assert job["status"] == "succeeded"
    assert job["result"]["report"]["screeningDecision"] == "shortlist"
    nodes = [p["node"] for p in job["progress"]]
    assert nodes[:4] == ["extract_info", "fetch_github", "match_jd", "build_report"]


def test_jobs_are_private_to_their_owner(client):
    job_id = client.post("/jobs", headers=bearer("alice"), json={"agent": "screen-candidate", "input": SCREEN_INPUT}).json()["job_id"]
    assert client.get(f"/jobs/{job_id}", headers=bearer("mallory")).status_code == 404
    assert client.get(f"/jobs/{job_id}", headers=bearer("alice")).status_code == 200


def test_idempotency_key_returns_the_same_job(client):
    body = {"agent": "screen-candidate", "input": SCREEN_INPUT, "idempotency_key": "click-123"}
    first = client.post("/jobs", headers=bearer("u2"), json=body).json()
    second = client.post("/jobs", headers=bearer("u2"), json=body).json()
    assert first["job_id"] == second["job_id"]
    assert first["created"] is True and second["created"] is False
    # …but the key is per user
    other = client.post("/jobs", headers=bearer("u3"), json=body).json()
    assert other["job_id"] != first["job_id"]


def test_unknown_agent_and_bad_input_are_rejected_up_front(client):
    assert client.post("/jobs", headers=bearer("u4"), json={"agent": "rm-rf", "input": {}}).status_code == 400
    assert client.post("/jobs", headers=bearer("u4"), json={"agent": "screen-candidate", "input": {"resume_text": "x"}}).status_code == 400


def test_usage_is_handed_out_exactly_once(client):
    job_id = client.post("/jobs", headers=bearer("u5"), json={"agent": "screen-candidate", "input": SCREEN_INPUT}).json()["job_id"]
    wait_for(client, job_id, bearer("u5"))
    first = client.post(f"/jobs/{job_id}/ack-usage", headers=bearer("u5")).json()
    second = client.post(f"/jobs/{job_id}/ack-usage", headers=bearer("u5")).json()
    assert first["first"] is True and "usage" in first
    assert second["first"] is False


def test_per_user_rate_limit(client, monkeypatch):
    monkeypatch.setenv("AGENT_USER_BURST", "2")
    monkeypatch.setenv("AGENT_USER_RPM", "1")
    monkeypatch.setattr(core.ratelimit, "_bucket", None)
    body = {"agent": "screen-candidate", "input": SCREEN_INPUT}
    codes = [client.post("/jobs", headers=bearer("greedy"), json=body).status_code for _ in range(3)]
    assert codes == [202, 202, 429]
    # another user is unaffected
    assert client.post("/jobs", headers=bearer("polite"), json=body).status_code == 202
    monkeypatch.setattr(core.ratelimit, "_bucket", None)


# ── runner / store internals ─────────────────────────────────────

class Empty(BaseModel):
    pass


def test_failed_handler_marks_job_failed():
    async def boom(request, caller):
        raise RuntimeError("secret internal detail")

    jobs.register("t-boom", Empty, boom)
    store = jobs.MemoryJobStore()

    async def scenario():
        job, _ = await store.create(agent="t-boom", payload={}, caller=Caller(via="legacy"), request_id=None, idempotency_key=None)
        await jobs.JobRunner(store, workers=0).run(await store.claim())
        return await store.get(job["id"])

    done = asyncio.run(scenario())
    assert done["status"] == "failed"
    assert done["error"] == "Agent run failed"  # internals are logged, not returned


def test_crashed_worker_job_is_reclaimed_then_given_up_on():
    async def ok(request, caller):
        return {"ok": True}

    jobs.register("t-ok", Empty, ok)
    store = jobs.MemoryJobStore()

    async def scenario():
        job, _ = await store.create(agent="t-ok", payload={}, caller=Caller(via="legacy"), request_id=None, idempotency_key=None)
        first = await store.claim()
        assert await store.claim() is None  # leased → no one else gets it
        # simulate the worker dying: its lease runs out
        store._jobs[job["id"]]["locked_until"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        second = await store.claim()
        assert (first["attempts"], second["attempts"]) == (1, 2)

        store._jobs[job["id"]]["attempts"] = jobs.MAX_ATTEMPTS  # next claim exceeds the cap
        store._jobs[job["id"]]["locked_until"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        await jobs.JobRunner(store, workers=0).run(await store.claim())
        return await store.get(job["id"])

    done = asyncio.run(scenario())
    assert done["status"] == "failed"
    assert "too many times" in done["error"]
