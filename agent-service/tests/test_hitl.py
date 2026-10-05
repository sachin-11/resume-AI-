"""Human-in-the-loop gates: the run pauses, a recruiter answers, the run finishes."""
import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel

import agents.orchestrator.nodes as orchestrator_nodes
import agents.scheduler.nodes as scheduler_nodes
import core.llm

H = {"x-agent-secret": "test-secret"}
USER = "rec_1"

SLOTS = [
    {"id": "slot_a", "startsAt": "2030-01-07T10:00:00Z", "durationMin": 30, "isBooked": False},
    {"id": "slot_b", "startsAt": "2030-01-07T13:00:00Z", "durationMin": 30, "isBooked": False},
]


@pytest.fixture
def copilot(monkeypatch):
    import main
    monkeypatch.setenv("AGENT_SECRET", "test-secret")

    def script(*replies):
        model = FakeListChatModel(responses=list(replies))
        fake = lambda temperature=0.3, tier="reasoning": model  # noqa: E731
        for module in (core.llm, orchestrator_nodes, scheduler_nodes):
            monkeypatch.setattr(module, "get_llm", fake)
        return model

    with TestClient(main.app) as client:
        yield client, script


def screen_to_reject(client, script):
    script(
        '{"intent": "resume_screening"}',
        '{"skills": ["HTML"], "github_username": null}',
        '{"match_score": 22, "screening_decision": "reject", "decision_reasons": ["No backend experience"]}',
    )
    return client.post("/orchestrate", headers=H, json={
        "user_id": USER, "user_message": "Screen this candidate please",
        "resume_text": "x" * 60, "job_description": "Backend engineer", "candidate_name": "Ravi",
    }).json()


def test_ai_reject_pauses_for_recruiter(copilot):
    client, script = copilot
    body = screen_to_reject(client, script)
    assert body["status"] == "awaiting_approval"
    assert body["approval"]["type"] == "confirm_rejection"
    assert body["approval"]["reasons"] == ["No backend experience"]
    # Paused run shows up when the thread is reopened
    thread = client.get(f"/threads/{body['thread_id']}", headers=H, params={"user_id": USER}).json()
    assert thread["pending_approval"]["type"] == "confirm_rejection"


def test_recruiter_override_is_recorded(copilot):
    client, script = copilot
    thread_id = screen_to_reject(client, script)["thread_id"]

    done = client.post(f"/threads/{thread_id}/resume", headers=H, json={
        "user_id": USER, "type": "confirm_rejection", "decision": "maybe", "note": "Strong potential",
    }).json()
    assert done["status"] == "completed"
    report = done["result"]["report"]
    assert report["screeningDecision"] == "maybe"
    assert report["humanReview"] == {"aiDecision": "reject", "decision": "maybe", "note": "Strong potential", "reviewer": USER}
    assert done["needs_human_review"] is False
    assert "changed the AI's REJECT to MAYBE" in done["reply"]


def test_new_message_is_blocked_while_approval_pending(copilot):
    client, script = copilot
    thread_id = screen_to_reject(client, script)["thread_id"]
    res = client.post("/orchestrate", headers=H, json={
        "user_id": USER, "thread_id": thread_id, "user_message": "never mind, hello",
    })
    assert res.status_code == 409


def test_resume_validation(copilot):
    client, script = copilot
    thread_id = screen_to_reject(client, script)["thread_id"]
    wrong_type = client.post(f"/threads/{thread_id}/resume", headers=H, json={
        "user_id": USER, "type": "book_interview", "approved": True, "slot_id": "slot_a",
    })
    assert wrong_type.status_code == 400
    missing = client.post(f"/threads/{thread_id}/resume", headers=H, json={"user_id": USER, "type": "confirm_rejection"})
    assert missing.status_code == 400


def test_resume_with_nothing_pending_is_409(copilot):
    client, script = copilot
    script('{"intent": "other"}', "hello")
    thread_id = client.post("/orchestrate", headers=H, json={"user_id": USER, "user_message": "hello there"}).json()["thread_id"]
    res = client.post(f"/threads/{thread_id}/resume", headers=H, json={
        "user_id": USER, "type": "confirm_rejection", "decision": "reject",
    })
    assert res.status_code == 409


def test_other_users_cannot_answer_your_approval(copilot):
    client, script = copilot
    thread_id = screen_to_reject(client, script)["thread_id"]
    res = client.post(f"/threads/{thread_id}/resume", headers=H, json={
        "user_id": "intruder", "type": "confirm_rejection", "decision": "shortlist",
    })
    assert res.status_code == 409  # their namespace has no such paused run


def schedule(client, script, email="ravi@example.com"):
    script('{"intent": "scheduling"}', "Hi Ravi, here are some times.")
    return client.post("/orchestrate", headers=H, json={
        "user_id": USER, "user_message": "Book Ravi for an interview",
        "candidate_name": "Ravi", "candidate_email": email, "existing_slots": SLOTS,
    }).json()


def test_booking_needs_approval_and_only_offered_slots(copilot):
    client, script = copilot
    body = schedule(client, script)
    assert body["status"] == "awaiting_approval"
    assert [s["slotId"] for s in body["approval"]["slots"]] == ["slot_a", "slot_b"]

    forged = client.post(f"/threads/{body['thread_id']}/resume", headers=H, json={
        "user_id": USER, "type": "book_interview", "approved": True, "slot_id": "someone_elses_slot",
    })
    assert forged.status_code == 400

    done = client.post(f"/threads/{body['thread_id']}/resume", headers=H, json={
        "user_id": USER, "type": "book_interview", "approved": True, "slot_id": "slot_b",
        "message": "See you Tuesday!",
    }).json()
    action = done["result"]["action"]
    assert action["status"] == "approved"
    assert action["slot_id"] == "slot_b"
    assert action["message"] == "See you Tuesday!"


def test_declined_booking(copilot):
    client, script = copilot
    body = schedule(client, script)
    done = client.post(f"/threads/{body['thread_id']}/resume", headers=H, json={
        "user_id": USER, "type": "book_interview", "approved": False,
    }).json()
    assert done["result"]["action"]["status"] == "declined"
    assert "nothing was booked" in done["reply"]


def test_no_gate_without_candidate_email(copilot):
    client, script = copilot
    body = schedule(client, script, email=None)
    assert body["status"] == "completed"
