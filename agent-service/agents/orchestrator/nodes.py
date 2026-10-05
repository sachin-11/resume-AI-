"""
Recruitment Copilot Orchestrator — Nodes
"""
from typing import Literal, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import interrupt
from pydantic import BaseModel, Field, model_validator

from agents.shared.llm import get_llm
from agents.shared.observability import trace_guardrail
from agents.candidate_screening.graph import candidate_screening_agent
from agents.scheduler.graph import scheduler_agent
from agents.faq.graph import faq_agent
from core.llm import ainvoke_structured


Intent = Literal["resume_screening", "scheduling", "faq", "other"]
MAX_STEPS = 3


class PlanStep(BaseModel):
    intent: Intent
    condition: Literal["always", "if_shortlisted"] = "always"


class PlanOutput(BaseModel):
    steps: list[PlanStep] = Field(min_length=1, max_length=MAX_STEPS)
    reasoning: str = ""

    @model_validator(mode="before")
    @classmethod
    def _accept_single_intent(cls, data):
        # A one-step reply in the old {"intent": ...} shape is still a valid plan.
        if isinstance(data, dict) and "steps" not in data and "intent" in data:
            return {"steps": [{"intent": data["intent"]}], "reasoning": data.get("reasoning", "")}
        return data


def normalize_plan(steps: list[PlanStep]) -> list[dict]:
    """Make an LLM plan safe to execute: each intent at most once, `if_shortlisted`
    only after a screening step, "other" never mixed with real work, ≤ MAX_STEPS."""
    plan: list[dict] = []
    for step in steps:
        if any(p["intent"] == step.intent for p in plan):
            continue
        condition = step.condition
        if condition == "if_shortlisted" and not any(p["intent"] == "resume_screening" for p in plan):
            condition = "always"
        plan.append({"intent": step.intent, "condition": condition})
    if len(plan) > 1:
        plan = [p for p in plan if p["intent"] != "other"] or plan[:1]
    return plan[:MAX_STEPS]


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


async def plan_steps(state: dict) -> dict:
    """Node 1: Turn the message into a short plan of steps (usually one)."""
    message = state.get("user_message", "")
    history = _format_history(_prior_messages(state, limit=6))
    history_block = (
        f"\nConversation so far (use it to resolve references like 'her', 'that role', 'same time'):\n{history[:2500]}\n"
        if history else ""
    )

    prompt = f"""Plan the steps needed to handle this recruiter/candidate message. Most messages need ONE step;
use more (max {MAX_STEPS}) only when the message clearly asks for several things. Return ONLY valid JSON:
{{
  "steps": [{{"intent": "resume_screening", "condition": "always"}}],
  "reasoning": "one short sentence"
}}

Examples:
- "Screen Priya for the backend role" → [{{"intent": "resume_screening"}}]
- "Screen her and if she's shortlisted set up an interview" →
  [{{"intent": "resume_screening"}}, {{"intent": "scheduling", "condition": "if_shortlisted"}}]
- "Book Ravi for Tuesday — also, what's our notice period policy?" → [{{"intent": "scheduling"}}, {{"intent": "faq"}}]

condition: "always" (default) or "if_shortlisted" (run only if an earlier screening step shortlists the candidate).

Each intent must be one of:
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
        PlanOutput,
        fallback=PlanOutput(steps=[PlanStep(intent="other")], reasoning="Could not plan — defaulting to general handler"),
        tier="fast",
        temperature=0,
        name="orchestrator.plan",
    )
    plan = normalize_plan(result.data.steps)
    reasoning = result.data.reasoning
    summary = " → ".join(
        p["intent"] + (" (if shortlisted)" if p["condition"] == "if_shortlisted" else "") for p in plan
    )

    return {
        "plan": plan,
        "step_index": 0,
        "executed_steps": [],
        "skipped_steps": [],
        "intent": plan[0]["intent"],
        "intent_reasoning": reasoning,
        "logs": [f"🧭 Plan: {summary} — {reasoning}"],
    }


def supervisor(state: dict) -> dict:
    """Pick the next plan step whose condition holds; "finalize" when the plan is done.

    Deterministic on purpose: the LLM decides *what* to do once (the plan); whether
    a conditional step runs is decided from actual results, not by another LLM call.
    Every pass advances step_index, so the loop always ends within len(plan) steps.
    """
    plan = state.get("plan") or []
    index = state.get("step_index", 0)
    skipped = list(state.get("skipped_steps") or [])
    logs = []

    while index < len(plan):
        step = plan[index]
        index += 1
        if step["condition"] == "if_shortlisted":
            decision = ((state.get("resume_screener_result") or {}).get("report") or {}).get("screeningDecision")
            if decision != "shortlist":
                reason = f"candidate was not shortlisted ({decision or 'no screening result'})"
                skipped.append({"intent": step["intent"], "reason": reason})
                logs.append(f"⏭️ Supervisor skipped {step['intent']} — {reason}")
                continue
        logs.append(f"🧑‍✈️ Supervisor → {step['intent']} (step {index}/{len(plan)})")
        return {
            "step_index": index,
            "next_step": step["intent"],
            "intent": step["intent"],
            "executed_steps": [*(state.get("executed_steps") or []), step["intent"]],
            "skipped_steps": skipped,
            "logs": logs,
        }

    return {"step_index": index, "next_step": "finalize", "skipped_steps": skipped, "logs": logs}


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


RESULT_KEYS = {
    "resume_screening": "resume_screener_result",
    "scheduling": "scheduler_result",
    "faq": "faq_result",
    "other": "other_result",
}


def _review_reasons(intent: str, result: dict) -> list[str]:
    reasons = []
    if intent == "resume_screening":
        report = result.get("report", {})
        if report.get("aiFallback"):
            reasons.append("Screening AI reply was invalid — decision is a default, not an AI judgement")
        if report.get("screeningDecision") == "reject" and not report.get("humanReview"):
            reasons.append("Agent recommended reject — flagged for human confirmation")
        elif result.get("status") == "missing_input":
            reasons.append("Required input missing")
    elif intent == "faq":
        if not result.get("sources"):
            reasons.append("No indexed company docs matched the question — answer is a no-context fallback")
        elif result.get("faithfulness", 1.0) < 0.5:
            reasons.append(f"Low faithfulness score ({result.get('faithfulness'):.2f}) — possible hallucination")
    elif result.get("status") == "not_implemented":
        reasons.append("Routed sub-agent is not implemented yet")
    return reasons


def finalize(state: dict) -> dict:
    """Node: combine every executed step into one response, run the guardrail check,
    and log it to Langfuse (no-op if unconfigured)."""
    executed = state.get("executed_steps") or [state.get("intent", "other")]
    skipped = state.get("skipped_steps") or []

    steps = []
    for intent in executed:
        result = state.get(RESULT_KEYS.get(intent, "other_result"), {}) or {}
        reasons = _review_reasons(intent, result)
        steps.append({
            "intent": intent,
            "result": result,
            "reply": _reply_text(intent, result),
            "needs_human_review": bool(reasons),
            "review_reasons": reasons,
        })

    reasons = [r for step in steps for r in step["review_reasons"]]
    needs_review = bool(reasons)
    reply = "\n\n".join(step["reply"] for step in steps if step["reply"])
    for skip in skipped:
        reply += f"\n\nSkipped {skip['intent']} — {skip['reason']}."
    primary = steps[-1] if steps else {"intent": "other", "result": {}}

    trace_guardrail(
        name="orchestrator-turn",
        input_data={"user_message": state.get("user_message", ""), "plan": state.get("plan", [])},
        output_data=[step["result"] for step in steps],
        scores={"needs_human_review": 1.0 if needs_review else 0.0},
        metadata={"reasons": reasons, "steps": executed, "skipped": len(skipped)},
    )

    return {
        "needs_human_review": needs_review,
        "review_reasons": reasons,
        "final_response": {
            # `intent`/`result` = the last step (unchanged shape for one-step turns);
            # `steps` carries every step of a multi-step plan.
            "intent": primary["intent"],
            "intent_reasoning": state.get("intent_reasoning", ""),
            "result": primary["result"],
            "steps": steps,
            "skipped_steps": skipped,
            "needs_human_review": needs_review,
            "review_reasons": reasons,
        },
        "messages": [AIMessage(content=reply.strip())],
        "logs": [f"🏁 Orchestrator finalized {len(steps)} step(s)" + (" — 🛡️ flagged for human review" if needs_review else "")],
    }
