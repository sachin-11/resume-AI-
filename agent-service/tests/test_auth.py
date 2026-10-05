"""Service auth: signed user tokens, no downgrade to the shared secret, identity from the token only."""
import time

import jwt
import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel

import agents.orchestrator.nodes as orchestrator_nodes
import core.llm
from core.auth import AUDIENCE, ISSUER

SECRET = "test-secret"


def token(sub="user_a", org="org_1", role="recruiter", key=SECRET, exp_in=120, **overrides):
    now = int(time.time())
    claims = {"iss": ISSUER, "aud": AUDIENCE, "sub": sub, "org": org, "role": role,
              "iat": now, "exp": now + exp_in, **overrides}
    return jwt.encode(claims, key, algorithm="HS256")


def bearer(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture
def client(monkeypatch):
    import main
    monkeypatch.setenv("AGENT_SECRET", SECRET)
    model = FakeListChatModel(responses=['{"intent": "other"}', "hello"])
    monkeypatch.setattr(core.llm, "get_llm", lambda temperature=0.3, tier="reasoning": model)
    monkeypatch.setattr(orchestrator_nodes, "get_llm", lambda temperature=0.3, tier="reasoning": model)
    with TestClient(main.app) as c:
        yield c


def ask(client, headers, **body):
    return client.post("/orchestrate", headers=headers, json={"user_message": "hello there", **body})


def test_valid_token_is_accepted_and_sets_the_user(client):
    res = ask(client, bearer(token()))
    assert res.status_code == 200
    assert "thread_id" in res.json()  # user came from the token → stateful thread


@pytest.mark.parametrize("bad", [
    token(exp_in=-120),                      # expired (beyond leeway)
    token(key="wrong-secret"),               # forged signature
    token(aud="some-other-service"),          # wrong audience
    token(iss="attacker"),                   # wrong issuer
    jwt.encode({"sub": "user_a", "aud": AUDIENCE, "iss": ISSUER, "exp": int(time.time()) + 60,
                "iat": int(time.time())}, key=None, algorithm="none"),  # alg=none
    "not-a-jwt",
])
def test_bad_tokens_are_rejected(client, bad):
    assert ask(client, bearer(bad)).status_code == 401


def test_bad_token_is_not_downgraded_to_legacy_secret(client):
    headers = {**bearer(token(key="wrong-secret")), "x-agent-secret": SECRET}
    assert ask(client, headers).status_code == 401


def test_body_user_id_cannot_override_token_subject(client):
    res = ask(client, bearer(token(sub="user_a")), user_id="user_b")
    assert res.status_code == 403


def test_threads_follow_the_token_user(client):
    thread_id = ask(client, bearer(token(sub="alice"))).json()["thread_id"]
    as_alice = client.get(f"/threads/{thread_id}", headers=bearer(token(sub="alice"))).json()
    as_bob = client.get(f"/threads/{thread_id}", headers=bearer(token(sub="bob"))).json()
    assert as_alice["exists"] is True
    assert as_bob["exists"] is False


def test_legacy_secret_still_works_during_migration(client):
    assert ask(client, {"x-agent-secret": SECRET}).status_code == 200
    assert ask(client, {"x-agent-secret": "wrong"}).status_code == 401


def test_legacy_secret_can_be_switched_off(client, monkeypatch):
    monkeypatch.setenv("AGENT_ALLOW_LEGACY_SECRET", "false")
    assert ask(client, {"x-agent-secret": SECRET}).status_code == 401
    assert ask(client, bearer(token())).status_code == 200


def test_unset_secret_locks_everything(client, monkeypatch):
    monkeypatch.delenv("AGENT_SECRET")
    assert ask(client, {"x-agent-secret": ""}).status_code == 401
    assert ask(client, bearer(token())).status_code == 401
