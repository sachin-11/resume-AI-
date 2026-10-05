"""Planner + supervisor: multi-step turns, conditional steps, and their interplay with approval gates."""
import json

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel

import agents.faq.nodes as faq_nodes
import agents.orchestrator.nodes as orchestrator_nodes
import agents.scheduler.nodes as scheduler_nodes
import core.llm
from agents.orchestrator.nodes import PlanStep, normalize_plan

H = {"x-agent-secret": "test-secret"}
USER = "rec_9"

SCREEN_THEN_SCHEDULE = json.dumps({"steps": [
    {"intent": "resume_screening"}, {"intent": "scheduling", "condition": "if_shortlisted"},
]})
EXTRACT = '{"skills": ["Python"], "github_username": null}'


def match(decision: str) -> str:
    return json.dumps({"match_score": 30 if decision == "reject" else 85, "screening_decision": decision})


@pytest.fixture
def copilot(monkeypatch):
    import main
    monkeypatch.setenv("AGENT_SECRET", "test-secret")

    def script(*replies):
        model = FakeListChatModel(responses=list(replies))
        fake = lambda temperature=0.3, tier="reasoning": model  # noqa: E731
        for module in (core.llm, orchestrator_nodes, scheduler_nodes):
            monkeypatch.setattr(module, "get_llm", fake)

    with TestClient(main.app) as client:
        yield client, script


def ask(client, message, **context):
    return client.post("/orchestrate", headers=H, json={
        "user_id": USER, "user_message": message,
        "resume_text": "x" * 60, "job_description": "Backend", "candidate_name": "Asha", **context,
    }).json()


# ── normalize_plan ───────────────────────────────────────────────

def steps(*specs):
    return [PlanStep(intent=i, condition=c) for i, c in specs]


def test_plan_is_deduplicated_and_capped():
    plan = normalize_plan(steps(("faq", "always"), ("faq", "always"), ("scheduling", "always"),
                                ("resume_screening", "always")))
    assert [p["intent"] for p in plan] == ["faq", "scheduling", "resume_screening"]


def test_if_shortlisted_needs_an_earlier_screening_step():
    plan = normalize_plan(steps(("scheduling", "if_shortlisted"), ("resume_screening", "always")))
    assert plan[0] == {"intent": "scheduling", "condition": "always"}


def test_other_is_dropped_when_mixed_with_real_work():
    assert normalize_plan(steps(("other", "always"), ("faq", "always"))) == [{"intent": "faq", "condition": "always"}]


# ── end to end ───────────────────────────────────────────────────

def test_shortlisted_candidate_flows_into_scheduling(copilot):
    client, script = copilot
    script(SCREEN_THEN_SCHEDULE, EXTRACT, match("shortlist"), "Hi Asha, here are some times.")
    body = ask(client, "Screen Asha and if she's shortlisted set up an interview")

    assert body["status"] == "completed"
    assert [s["intent"] for s in body["steps"]] == ["resume_screening", "scheduling"]
    assert body["skipped_steps"] == []
    assert "SHORTLIST" in body["reply"] and "Hi Asha" in body["reply"]


def test_confirmed_reject_skips_the_conditional_step(copilot):
    client, script = copilot
    script(SCREEN_THEN_SCHEDULE, EXTRACT, match("reject"))
    paused = ask(client, "Screen Asha and if she's shortlisted set up an interview")
    assert paused["approval"]["type"] == "confirm_rejection"

    done = client.post(f"/threads/{paused['thread_id']}/resume", headers=H, json={
        "user_id": USER, "type": "confirm_rejection", "decision": "reject",
    }).json()
    assert [s["intent"] for s in done["steps"]] == ["resume_screening"]
    assert done["skipped_steps"][0]["intent"] == "scheduling"
    assert "Skipped scheduling — candidate was not shortlisted (reject)" in done["reply"]


def test_recruiter_override_unlocks_the_conditional_step(copilot):
    client, script = copilot
    script(SCREEN_THEN_SCHEDULE, EXTRACT, match("reject"), "Hi Asha, here are some times.")
    paused = ask(client, "Screen Asha and if she's shortlisted set up an interview")

    done = client.post(f"/threads/{paused['thread_id']}/resume", headers=H, json={
        "user_id": USER, "type": "confirm_rejection", "decision": "shortlist", "note": "Great OSS work",
    }).json()
    assert [s["intent"] for s in done["steps"]] == ["resume_screening", "scheduling"]
    assert done["steps"][0]["result"]["report"]["humanReview"]["decision"] == "shortlist"


def test_two_independent_steps_in_one_turn(copilot, monkeypatch, scripted_tool_model):
    from langchain_core.messages import AIMessage
    client, script = copilot

    # FAQ (ReAct): the model answers without searching → grounded fallback, flagged
    faq_model = scripted_tool_model(AIMessage(content="Probably 30 days."))
    monkeypatch.setattr(faq_nodes, "get_llm", lambda temperature=0.3, tier="reasoning": faq_model)
    script(json.dumps({"steps": [{"intent": "scheduling"}, {"intent": "faq"}]}), "Hi Asha, here are some times.")
    body = ask(client, "Propose slots for Asha, and what's our notice period policy?")

    assert [s["intent"] for s in body["steps"]] == ["scheduling", "faq"]
    # FAQ found no docs → that step is flagged, the scheduling step is not
    flags = {s["intent"]: s["needs_human_review"] for s in body["steps"]}
    assert flags == {"scheduling": False, "faq": True}
