"""Decision-making nodes: valid replies flow through, invalid ones are flagged, never faked."""
import asyncio

from agent.nodes import score_check
from agents.candidate_screening.nodes import match_against_jd
from agents.interview_panel.graph import panel_consensus, technical_agent_eval
from agents.orchestrator.nodes import finalize, plan_steps
from agents.shared.eval import evaluate_rag_answer


def test_router_accepts_known_intent(fake_llm):
    fake_llm('{"intent": "faq", "reasoning": "policy question"}')
    out = asyncio.run(plan_steps({"user_message": "What is the leave policy?"}))
    assert out["plan"] == [{"intent": "faq", "condition": "always"}]


def test_router_unknown_intent_falls_back_to_other(fake_llm):
    fake_llm('{"intent": "delete_database"}', '{"intent": "hack"}')
    out = asyncio.run(plan_steps({"user_message": "x"}))
    assert out["plan"] == [{"intent": "other", "condition": "always"}]


def test_screening_fallback_is_flagged_for_human_review(fake_llm):
    fake_llm("oops", "oops again")
    out = asyncio.run(match_against_jd({"job_description": "JD", "resume_text": "CV"}))
    assert out["ai_fallback"] is True
    assert out["screening_decision"] == "maybe"

    final = finalize({
        "intent": "resume_screening",
        "resume_screener_result": {"status": "ok", "report": {"screeningDecision": "maybe", "aiFallback": True}},
    })
    assert final["needs_human_review"] is True


def test_rag_judge_failure_trips_faithfulness_guardrail(fake_llm):
    fake_llm("??", "??")
    scores = asyncio.run(evaluate_rag_answer("q", [{"text": "ctx"}], "a"))
    assert scores["faithfulness"] < 0.5


def test_score_check_fallback_does_not_invent_improvement(fake_llm):
    fake_llm("bad", "bad")
    out = score_check({"resume_text": "CV", "current_score": 55})
    assert out["current_score"] == 55


def test_panel_surfaces_degraded_agents(fake_llm):
    fake_llm("bad", "bad")
    tech = asyncio.run(technical_agent_eval({"qa_pairs": [], "role": "Dev"}))["technical_verdict"]
    assert tech["ai_fallback"] is True

    ok = {"verdict": "pass", "ai_fallback": False}
    report = panel_consensus({
        "technical_verdict": tech,
        "hr_verdict": {**ok, "communication_score": 80},
        "domain_verdict": {**ok, "domain_score": 80},
    })["panel_report"]
    assert report["degradedAgents"] == ["technical"]


def test_screening_decision_follows_the_final_score():
    from agents.candidate_screening.nodes import build_screening_report, decide

    assert [decide(s) for s in (49, 50, 74, 75)] == ["reject", "maybe", "maybe", "shortlist"]
    # GitHub-verified skills can lift a borderline score over the shortlist bar…
    report = build_screening_report({"jd_match_score": 70, "github_skill_match": ["Python", "Go", "SQL"]})
    assert (report["overall_rating"], report["screening_report"]["screeningDecision"]) == (76, "shortlist")
    # …but a fallback (no real AI judgement) is never an automatic decision either way.
    report = build_screening_report({"jd_match_score": 90, "ai_fallback": True})
    assert report["screening_report"]["screeningDecision"] == "maybe"
