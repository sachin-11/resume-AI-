"""
Recruitment Copilot Orchestrator — Nodes
"""
from agents.shared.llm import get_llm, safe_json_parse
from agents.shared.observability import trace_guardrail
from agents.candidate_screening.graph import candidate_screening_agent
from agents.scheduler.graph import scheduler_agent
from agents.faq.graph import faq_agent

VALID_INTENTS = {"resume_screening", "scheduling", "faq", "other"}


async def classify_intent(state: dict) -> dict:
    """Node 1: Classify the user's message into a routable intent."""
    llm = get_llm(temperature=0)
    message = state.get("user_message", "")

    prompt = f"""Classify this recruiter/candidate message into exactly one intent. Return ONLY valid JSON:
{{
  "intent": "resume_screening",
  "reasoning": "one short sentence"
}}

intent must be one of:
- "resume_screening": asking to screen/evaluate/match a candidate's resume against a job
- "scheduling": asking to book, propose, reschedule, or check an interview/calendar slot
- "faq": asking a question about company policy, process, or how something works
- "other": anything else (greetings, unrelated chit-chat, unclear requests)

Message:
{message[:1500]}"""

    response = await llm.ainvoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, "content") else str(response),
        {"intent": "other", "reasoning": "Could not classify — defaulting to general handler"},
    )

    intent = result.get("intent", "other")
    if intent not in VALID_INTENTS:
        intent = "other"

    return {
        "intent": intent,
        "intent_reasoning": result.get("reasoning", ""),
        "logs": [f"🧭 Classified intent: '{intent}' — {result.get('reasoning', '')}"],
    }


async def run_resume_screener(state: dict) -> dict:
    """Branch: delegate to the existing Candidate Screening Agent."""
    resume_text = state.get("resume_text")
    job_description = state.get("job_description")

    if not resume_text or not job_description:
        return {
            "resume_screener_result": {
                "status": "missing_input",
                "message": "resume_text and job_description are both required for resume screening.",
            },
            "logs": ["⚠️ Resume screening requested but resume_text/job_description missing"],
        }

    sub_state = {
        "resume_text": resume_text,
        "job_description": job_description,
        "candidate_name": state.get("candidate_name", ""),
        "candidate_email": state.get("candidate_email", ""),
        "github_username": state.get("github_username"),
        "extracted_skills": [],
        "extracted_github": state.get("github_username"),
        "github_repos": [],
        "github_skill_match": [],
        "jd_match_score": 0,
        "matched_skills": [],
        "missing_skills": [],
        "overall_rating": 0,
        "screening_decision": "maybe",
        "decision_reasons": [],
        "red_flags": [],
        "green_flags": [],
        "screening_report": {},
        "logs": [],
    }

    final = await candidate_screening_agent.ainvoke(sub_state)

    return {
        "resume_screener_result": {
            "status": "ok",
            "report": final.get("screening_report", {}),
        },
        "logs": [f"✅ Resume screener sub-agent completed: {final.get('screening_decision', 'maybe').upper()}"],
    }


async def run_scheduler(state: dict) -> dict:
    """Branch: delegate to the Scheduler Agent (proposes InterviewSlot times + confirmation message)."""
    sub_state = {
        "candidate_name": state.get("candidate_name") or "Candidate",
        "candidate_email": state.get("candidate_email") or "",
        "role": state.get("job_description", "")[:80] or "the role",
        "requested_timeframe": state.get("user_message", ""),
        "timezone": "Asia/Kolkata",
        "existing_slots": state.get("existing_slots") or [],
        "calendar_source": "",
        "proposed_slots": [],
        "confirmation_message": "",
        "logs": [],
    }

    final = await scheduler_agent.ainvoke(sub_state)

    return {
        "scheduler_result": {
            "status": "ok",
            "calendar_source": final.get("calendar_source"),
            "proposed_slots": final.get("proposed_slots", []),
            "confirmation_message": final.get("confirmation_message", ""),
        },
        "logs": [f"✅ Scheduler sub-agent completed (source: {final.get('calendar_source')})"],
    }


async def run_faq_answerer(state: dict) -> dict:
    """Branch: delegate to the FAQ Answerer Agent (retrieval over company docs in Pinecone)."""
    sub_state = {
        "question": state.get("user_message", ""),
        "retrieved_chunks": [],
        "answer": "",
        "sources": [],
        "logs": [],
    }

    final = await faq_agent.ainvoke(sub_state)

    return {
        "faq_result": {
            "status": "ok",
            "answer": final.get("answer", ""),
            "sources": final.get("sources", []),
            "faithfulness": final.get("faithfulness", 0.0),
            "answer_relevancy": final.get("answer_relevancy", 0.0),
        },
        "logs": [f"✅ FAQ answerer sub-agent completed ({len(final.get('sources', []))} source(s))"],
    }


async def run_other(state: dict) -> dict:
    """Branch: general fallback — plain LLM response, no tool/agent dispatch."""
    llm = get_llm()
    message = state.get("user_message", "")

    response = await llm.ainvoke(
        f"You are a recruitment copilot assistant. Reply briefly and helpfully to this message:\n{message[:1000]}"
    )
    text = response.content if hasattr(response, "content") else str(response)

    return {
        "other_result": {"status": "ok", "message": text},
        "logs": ["💬 Handled via general fallback (no specific sub-agent matched)"],
    }


def finalize(state: dict) -> dict:
    """Node: assemble the final response, run the guardrail check, and log it to Langfuse.

    This is the "Guardrail + eval" gate: a human-review flag with reasons, plus a
    trace (input/output/scores) sent to Langfuse if configured — otherwise a no-op.
    """
    intent = state.get("intent", "other")
    result_map = {
        "resume_screening": state.get("resume_screener_result", {}),
        "scheduling": state.get("scheduler_result", {}),
        "faq": state.get("faq_result", {}),
        "other": state.get("other_result", {}),
    }
    result = result_map.get(intent, {})

    needs_review = False
    reasons = []

    if intent == "resume_screening":
        decision = result.get("report", {}).get("screeningDecision")
        if decision == "reject":
            needs_review = True
            reasons.append("Agent recommended reject — flagged for human confirmation")
        elif result.get("status") == "missing_input":
            needs_review = True
            reasons.append("Required input missing")
    elif intent == "faq":
        if not result.get("sources"):
            needs_review = True
            reasons.append("No indexed company docs matched the question — answer is a no-context fallback")
        elif result.get("faithfulness", 1.0) < 0.5:
            needs_review = True
            reasons.append(f"Low faithfulness score ({result.get('faithfulness'):.2f}) — possible hallucination")
    elif result.get("status") == "not_implemented":
        needs_review = True
        reasons.append("Routed sub-agent is not implemented yet")

    trace_guardrail(
        name="orchestrator-turn",
        input_data={"user_message": state.get("user_message", ""), "intent": intent},
        output_data=result,
        scores={"needs_human_review": 1.0 if needs_review else 0.0},
        metadata={"reasons": reasons},
    )

    return {
        "needs_human_review": needs_review,
        "review_reasons": reasons,
        "final_response": {
            "intent": intent,
            "intent_reasoning": state.get("intent_reasoning", ""),
            "result": result,
            "needs_human_review": needs_review,
            "review_reasons": reasons,
        },
        "logs": ["🏁 Orchestrator finalized response" + (" — 🛡️ flagged for human review" if needs_review else "")],
    }
