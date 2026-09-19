"""
Scheduler Agent — Nodes
"""
import os
import json
from datetime import datetime, timedelta
from agents.shared.llm import get_llm
from agents.shared.mcp_client import StdioMCPClient


async def propose_slots(state: dict) -> dict:
    """Node 1: Propose interview slots.

    Tier 1 (opt-in): Calendar MCP tool — only attempted if GOOGLE_CALENDAR_MCP_COMMAND
                      and GOOGLE_CALENDAR_MCP_ARGS are explicitly configured (no package
                      is assumed/hardcoded — plug in whatever verified MCP server you use).
    Tier 2 (default): The app's own InterviewSlot rows (passed in via `existing_slots`),
                      filtered to unbooked and sorted by soonest.
    Tier 3 (fallback): Algorithmically generated business-hours slots for the next 5 weekdays.
    """
    logs = []
    timezone = state.get("timezone", "Asia/Kolkata")

    # ── Tier 1: Calendar MCP (opt-in via env) ──────────────────────
    mcp_command = os.getenv("GOOGLE_CALENDAR_MCP_COMMAND")
    mcp_args_raw = os.getenv("GOOGLE_CALENDAR_MCP_ARGS")
    if mcp_command and mcp_args_raw:
        try:
            mcp_args = json.loads(mcp_args_raw)
            tool_name = os.getenv("GOOGLE_CALENDAR_MCP_TOOL_NAME", "find_free_slots")
            logs.append(f"📅 [MCP] Trying Calendar MCP server ('{mcp_command}')...")
            client = StdioMCPClient(mcp_command, mcp_args, env=os.environ.copy())
            if await client.initialize():
                mcp_res = await client.call_tool(tool_name, {
                    "timeframe": state.get("requested_timeframe", ""),
                    "timezone": timezone,
                })
                await client.close()
                content_list = mcp_res.get("content", [])
                text_content = "".join([c.get("text", "") for c in content_list if c.get("type") == "text"])
                parsed = json.loads(text_content)
                if isinstance(parsed, list) and parsed:
                    logs.append(f"✅ [MCP] Calendar MCP returned {len(parsed)} free slots.")
                    return {
                        "calendar_source": "calendar_mcp",
                        "proposed_slots": parsed[:3],
                        "logs": logs,
                    }
                logs.append("⚠️ Calendar MCP returned no slots — falling back.")
        except Exception as e:
            logs.append(f"⚠️ Calendar MCP failed ({e}) — falling back to app-managed slots.")
    else:
        logs.append("ℹ️ Calendar MCP not configured (GOOGLE_CALENDAR_MCP_COMMAND/ARGS unset) — using app-managed slots.")

    # ── Tier 2: App-managed InterviewSlot rows ──────────────────────
    existing_slots = state.get("existing_slots") or []
    unbooked = [s for s in existing_slots if not s.get("isBooked")]
    if unbooked:
        unbooked.sort(key=lambda s: s.get("startsAt", ""))
        top = unbooked[:3]
        logs.append(f"✅ Found {len(unbooked)} unbooked InterviewSlot rows — proposing soonest {len(top)}.")
        return {
            "calendar_source": "db_slots",
            "proposed_slots": [
                {"slotId": s.get("id"), "startsAt": s.get("startsAt"), "durationMin": s.get("durationMin", 30)}
                for s in top
            ],
            "logs": logs,
        }

    # ── Tier 3: Generated business-hours slots ──────────────────────
    logs.append("ℹ️ No app-managed slots available — generating suggested business-hours slots.")
    generated = []
    day_offset = 1
    while len(generated) < 3 and day_offset <= 10:
        candidate_day = datetime.utcnow() + timedelta(days=day_offset)
        if candidate_day.weekday() < 5:  # Mon-Fri
            for hour in (10, 13, 15):
                if len(generated) >= 3:
                    break
                slot_dt = candidate_day.replace(hour=hour, minute=0, second=0, microsecond=0)
                generated.append({"startsAt": slot_dt.isoformat() + "Z", "durationMin": 30})
        day_offset += 1

    return {
        "calendar_source": "generated",
        "proposed_slots": generated,
        "logs": logs,
    }


def draft_confirmation(state: dict) -> dict:
    """Node 2: Draft a short interview-scheduling message with the proposed slots."""
    llm = get_llm()
    slots = state.get("proposed_slots", [])
    slot_lines = "\n".join(f"- {s.get('startsAt')} ({s.get('durationMin', 30)} min)" for s in slots)

    prompt = f"""Write a short, friendly interview-scheduling message to a candidate.

Candidate: {state.get('candidate_name', 'Candidate')}
Role: {state.get('role', 'the role')}
Timezone: {state.get('timezone', 'Asia/Kolkata')}

Offer these time slots and ask them to pick one (or suggest an alternative):
{slot_lines}

Keep it under 100 words, professional and warm. No subject line, just the message body."""

    response = llm.invoke(prompt)
    text = response.content if hasattr(response, "content") else str(response)

    return {
        "confirmation_message": text,
        "logs": [f"✍️ Drafted confirmation message offering {len(slots)} slots (source: {state.get('calendar_source')})"],
    }
