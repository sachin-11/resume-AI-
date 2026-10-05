"""Multi-turn Copilot memory: threads persist context, stay per-user, and turns don't leak."""
import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel

import agents.orchestrator.nodes as orchestrator_nodes
import core.llm
from core.memory import _libpq_url, thread_key

HEADERS = {"x-agent-secret": "test-secret"}


class RecordingFake(FakeListChatModel):
    """Fake LLM that also records the prompt of every call."""
    seen: list = []

    def _call(self, messages, *args, **kwargs):
        self.seen.append("\n".join(str(m.content) for m in messages))
        return super()._call(messages, *args, **kwargs)


@pytest.fixture
def copilot(monkeypatch):
    """TestClient (lifespan → in-memory checkpointer) + a scripted LLM for both router and replies."""
    import main
    monkeypatch.setenv("AGENT_SECRET", "test-secret")

    def script(*replies):
        model = RecordingFake(responses=list(replies), seen=[])
        monkeypatch.setattr(core.llm, "get_llm", lambda temperature=0.3, tier="reasoning": model)
        monkeypatch.setattr(orchestrator_nodes, "get_llm", lambda temperature=0.3, tier="reasoning": model)
        return model

    with TestClient(main.app) as client:
        yield client, script


def test_thread_key_rejects_unsafe_ids():
    assert thread_key("user_1", "abc-123") == "user_1:abc-123"
    for user_id, thread_id in [("a:b", "t"), ("u", "t:x"), ("", "t"), ("u", ""), ("u", "x" * 65)]:
        with pytest.raises(ValueError):
            thread_key(user_id, thread_id)


def test_prisma_params_are_stripped_from_db_url():
    url = "postgresql://u:p@host:5432/db?schema=public&sslmode=require&connection_limit=5"
    assert _libpq_url(url) == "postgresql://u:p@host:5432/db?sslmode=require"


def test_conversation_persists_across_turns(copilot):
    client, script = copilot
    model = script(
        '{"intent": "other"}', "Hi! Tell me about the candidate.",
        '{"intent": "other"}', "Noted — Priya, backend role.",
    )

    first = client.post("/orchestrate", headers=HEADERS, json={
        "user_message": "Hello, I'm screening Priya today", "user_id": "u1", "candidate_name": "Priya",
    }).json()
    thread_id = first["thread_id"]
    assert first["reply"] == "Hi! Tell me about the candidate."

    second = client.post("/orchestrate", headers=HEADERS, json={
        "user_message": "She applied for the backend role", "user_id": "u1", "thread_id": thread_id,
    }).json()
    assert second["thread_id"] == thread_id
    # Logs are per turn, not the whole thread's accumulated list
    assert len(second["logs"]) == len(first["logs"])

    # The router on turn 2 saw turn 1 in its prompt
    second_classify_prompt = model.seen[2]
    assert "Hello, I'm screening Priya today" in second_classify_prompt

    history = client.get(f"/threads/{thread_id}", headers=HEADERS, params={"user_id": "u1"}).json()
    assert [m["role"] for m in history["messages"]] == ["user", "assistant", "user", "assistant"]
    # Context given on turn 1 is still remembered on turn 2
    assert history["context"]["candidate_name"] == "Priya"


def test_threads_are_isolated_per_user(copilot):
    client, script = copilot
    script('{"intent": "other"}', "hello")
    thread_id = client.post("/orchestrate", headers=HEADERS, json={
        "user_message": "secret recruiting notes", "user_id": "alice",
    }).json()["thread_id"]

    other = client.get(f"/threads/{thread_id}", headers=HEADERS, params={"user_id": "mallory"}).json()
    assert other["exists"] is False
    assert other["messages"] == []


def test_delete_thread(copilot):
    client, script = copilot
    script('{"intent": "other"}', "hello")
    thread_id = client.post("/orchestrate", headers=HEADERS, json={
        "user_message": "hello there", "user_id": "u2",
    }).json()["thread_id"]

    assert client.delete(f"/threads/{thread_id}", headers=HEADERS, params={"user_id": "u2"}).status_code == 200
    assert client.get(f"/threads/{thread_id}", headers=HEADERS, params={"user_id": "u2"}).json()["exists"] is False


def test_invalid_thread_id_is_rejected(copilot):
    client, script = copilot
    script('{"intent": "other"}', "hello")
    res = client.post("/orchestrate", headers=HEADERS, json={
        "user_message": "hello there", "user_id": "u3", "thread_id": "../../etc",
    })
    assert res.status_code == 400


def test_without_user_id_runs_stateless(copilot):
    client, script = copilot
    script('{"intent": "other"}', "hello")
    body = client.post("/orchestrate", headers=HEADERS, json={"user_message": "hello there"}).json()
    assert body["success"] is True
    assert "thread_id" not in body
