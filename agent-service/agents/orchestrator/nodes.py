"""
Recruitment Copilot Orchestrator — Nodes
"""
from typing import Literal, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from agents.shared.llm import get_llm
from agents.shared.observability import trace_guardrail
from agents.candidate_screening.graph import candidate_screening_agent
from agents.scheduler.graph import scheduler_agent
from agents.faq.graph import faq_agent
from core.llm import ainvoke_structured


class IntentOutput(BaseModel):
    intent: Literal["resume_screening", "scheduling", "faq", "other"]
    reasoning: str = ""


def _prior_messages(state: dict, limit: int) -> list:
    """Earlier turns of this thread (the current user message is the last entry)."""
    messages = state.get("messages") or []
    if messages and getattr(messages[-1], "type", "") == "human":
        messages = messages[:-1]
    return messages[-limit:]


def _format_history(messages: list) -> str:
    return "\n".join(
        f"{'User' if m.type == 'human' else 'Copilot'}: {str(m.content)[:400]}" for m in messages
    )


async def classify_intent(state: dict) -> dict:
    """Node 1: Classify the user's message into a routable intent."""
    message = state.get("user_message", "")
    history = _format_history(_prior_messages(state, limit=6))
    history_block = (
        f"\nConversation so far (use it to resolve references like 'her', 'that role', 'same time'):\n{history[:2500]}\n"
        if history else ""
    )

    prompt = f"""Classify this recruiter/candidate message into exactly one intent. Return ONLY valid JSON:
{{
  "intent": "resume_screening",
  "reasoning": "one short sentence"
}}

intent must be one of:
- "resume_screening": asking to screen/evaluate/match a candidate's resume against a job
- "scheduling": asking to book, propose, reschedule, or check an interview/calendar slot
- "faq": asking about company policy or HR process (leave, benefits, hiring policy) — answered from company documents
- "other": anything else — greetings, chit-chat, unclear requests, and questions about this conversation itself
  (recapping or clarifying earlier results, e.g. "what was her score?", "which skills was she missing?")

{history_block}
Message:
{message[:1500]}"""

    result = await ainvoke_structured(
        prompt,
        IntentOutput,
        fallback=IntentOutput(intent="other", reasoning="Could not classify — defaulting to general handler"),
        tier="fast",
        temperature=0,
        name="orchestrator.classify_intent",
    )
    intent, reasoning = result.data.intent, result.data.reasoning

    return {
        "intent": intent,
        "intent_reasoning": reasoning,
        "logs": [f"🧭 Classified intent: '{intent}' — {reasoning}"],
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
        "ai_fallback": False,
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

    response = await llm.ainvoke([
        SystemMessage(content="You are a recruitment copilot assistant. Reply briefly and helpfully."),
        *_prior_messages(state, limit=10),
        HumanMessage(content=message[:1000]),
    ])
    text = response.content if hasattr(response, "content") else str(response)

    return {
        "other_result": {"status": "ok", "message": text},
        "logs": ["💬 Handled via general fallback (no specific sub-agent matched)"],
    }


# ── Human-in-the-loop gates ──────────────────────────────────────
# interrupt() pauses the graph — state is checkpointed — until the API resumes it
# with the recruiter's answer (POST /threads/{id}/resume). On resume LangGraph
# re-runs the node from the top, so nothing before interrupt() may have side
# effects. The booking itself happens outside the graph, after approval.

class RejectionReview(BaseModel):
    decision: Literal["reject", "maybe", "shortlist"]
    note: str = Field(default="", max_length=1000)
    reviewer: Optional[str] = None


class BookingReview(BaseModel):
    approved: bool
    slot_id: Optional[str] = None
    message: str = Field(default="", max_length=3000)
    reviewer: Optional[str] = None


def bookable_slots(scheduler_result: dict) -> list:
    """Proposed slots that are real InterviewSlot rows (generated suggestions can't be booked)."""
    if scheduler_result.get("calendar_source") != "db_slots":
        return []
    return [s for s in scheduler_result.get("proposed_slots", []) if s.get("slotId")]


def review_rejection(state: dict) -> dict:
    """Gate: an AI "reject" is never final until a recruiter confirms or overrides it."""
    result = state.get("resume_screener_result") or {}
    report = result.get("report") or {}
    if report.get("screeningDecision") != "reject":
        return {}

    answer = RejectionReview.model_validate(interrupt({
        "type": "confirm_rejection",
        "candidate_name": report.get("candidateName") or "the candidate",
        "rating": report.get("overallRating"),
        "reasons": report.get("decisionReasons", []),
        "red_flags": report.get("redFlags", []),
        "options": ["reject", "maybe", "shortlist"],
    }))

    human_review = {"aiDecision": "reject", "decision": answer.decision, "note": answer.note, "reviewer": answer.reviewer}
    overridden = answer.decision != "reject"
    return {
        "resume_screener_result": {**result, "report": {**report, "screeningDecision": answer.decision, "humanReview": human_review}},
        "logs": [f"👤 Recruiter {'overrode' if overridden else 'confirmed'} AI reject → {answer.decision.upper()}"],
    }


def approve_booking(state: dict) -> dict:
    """Gate: booking a slot and emailing the candidate needs explicit recruiter approval."""
    result = state.get("scheduler_result") or {}
    slots = bookable_slots(result)
    email = state.get("candidate_email")
    if not slots or not email:
        return {}

    answer = BookingReview.model_validate(interrupt({
        "type": "book_interview",
        "candidate_name": state.get("candidate_name") or "the candidate",
        "candidate_email": email,
        "slots": slots,
        "message": result.get("confirmation_message", ""),
    }))

    chosen = next((s for s in slots if s["slotId"] == answer.slot_id), None)
    approved = answer.approved and chosen is not None
    action = {
        "type": "book_interview",
        "status": "approved" if approved else "declined",
        "slot_id": chosen["slotId"] if approved else None,
        "starts_at": chosen.get("startsAt") if approved else None,
        "candidate_name": state.get("candidate_name"),
        "candidate_email": email,
        "message": (answer.message or result.get("confirmation_message", "")) if approved else "",
        "reviewer": answer.reviewer,
    }
    return {
        "scheduler_result": {**result, "action": action},
        "logs": [f"👤 Recruiter {'approved booking' if approved else 'declined booking'}"],
    }


def _reply_text(intent: str, result: dict) -> str:
    """The assistant turn stored in conversation history (and shown in the chat)."""
    if result.get("status") == "missing_input":
        return result.get("message", "Some required input is missing.")
    if intent == "resume_screening":
        r = result.get("report", {})
        name = r.get("candidateName") or "the candidate"
        lines = [f"Screening for {name}: {str(r.get('screeningDecision', 'maybe')).upper()} — rating {r.get('overallRating', '?')}/100."]
        review = r.get("humanReview")
        if review:
            lines.append(
                "Recruiter confirmed the AI's reject." if review["decision"] == "reject"
                else f"Recruiter changed the AI's REJECT to {review['decision'].upper()}."
            )
        if r.get("matchedSkills"):
            lines.append(f"Matched: {', '.join(r['matchedSkills'][:8])}")
        if r.get("missingSkills"):
            lines.append(f"Missing: {', '.join(r['missingSkills'][:8])}")
        return "\n".join(lines)
    if intent == "scheduling":
        action = result.get("action") or {}
        if action.get("status") == "approved":
            return f"Approved — booking {action.get('candidate_name') or 'the candidate'} for {action.get('starts_at')} and emailing {action.get('candidate_email')}."
        if action.get("status") == "declined":
            return "Okay — nothing was booked and no email was sent."
        return result.get("confirmation_message") or "I couldn't find any interview slots to propose."
    if intent == "faq":
        return result.get("answer", "")
    return result.get("message", "")


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
        report = result.get("report", {})
        decision = report.get("screeningDecision")
        if report.get("aiFallback"):
            needs_review = True
            reasons.append("Screening AI reply was invalid — decision is a default, not an AI judgement")
        if decision == "reject" and not report.get("humanReview"):
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
        "messages": [AIMessage(content=_reply_text(intent, result))],
        "logs": ["🏁 Orchestrator finalized response" + (" — 🛡️ flagged for human review" if needs_review else "")],
    }
