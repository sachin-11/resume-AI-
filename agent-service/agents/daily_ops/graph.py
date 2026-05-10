"""
Daily Ops Agent — productivity summaries, standups, inbox-style digests.

Graph: [START] → prepare → synthesize → END

Input is pasted text (emails, Slack exports, notes, Jira CSV, PR description, etc.).
Live OAuth for Gmail/Calendar/etc. is not required for this agent.
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Annotated
import operator

from agents.shared.llm import get_llm, safe_json_parse

# ── Task type → user-facing label (must match FastAPI + frontend values) ──
TASK_LABELS = {
    "morning_summary": "Morning task summary",
    "gmail_summarize": "Gmail / threads summarize",
    "slack_whatsapp_summarize": "Slack / WhatsApp messages summarize",
    "jira_check": "Jira tickets triage",
    "daily_standup": "Daily standup",
    "calendar_reminders": "Calendar-style reminders",
    "notes_organize": "Notes organize",
    "expense_tracking": "Expense tracking helper",
    "fitness_reminders": "Fitness / diet reminders",
    "coding_tasks": "Coding tasks",
    "github_pr_review": "GitHub PR review summary",
    "auto_document": "Auto document draft",
    "meeting_summary": "Meeting summary + action items",
    "followup_reminders": "Follow-up reminders",
    "learning_planner": "Daily learning planner",
    "research_news": "AI research / news summarize",
}

TASK_INSTRUCTIONS = {
    "morning_summary": """You are a productivity coach. From the user's pasted tasks, calendar snippets, and notes:
Produce a clear morning brief: priorities (top 3), time blocks suggestion, risks, and one focus mantra line.""",
    "gmail_summarize": """Summarize pasted email thread(s): who, what they want, deadlines, tone. Bullets only where useful.
Flag urgency and any missing info to reply.""",
    "slack_whatsapp_summarize": """Summarize pasted chat logs: decisions, open questions, action owners if visible, noise vs signal.""",
    "jira_check": """From pasted ticket titles/description/Sprint notes: grouped by status, blockers, top 3 to ship, quick wins.""",
    "daily_standup": """Generate yesterday / today / blockers standup from pasted work notes. Keep it concise, honest tone.""",
    "calendar_reminders": """From pasted events or schedule text: chronological reminders, conflicts, prep notes per event.""",
    "notes_organize": """Restructure messy notes into: themes, bullet lists, open questions, next steps.""",
    "expense_tracking": """From pasted expenses or receipts text: table-like categories, totals if numbers present, anomalies.""",
    "fitness_reminders": """From goals + constraints: gentle reminders, hydration/meal timing if relevant, realistic micro-habits.""",
    "coding_tasks": """Turn vague backlog into concrete coding tasks: title, acceptance criteria, estimate (S/M/L), dependencies.""",
    "github_pr_review": """From pasted PR title/body/diff summary: summary, risks, tests to add, approval suggestion with reasons.""",
    "auto_document": """Turn bullet facts into a short doc: purpose, scope, steps, FAQ stub.""",
    "meeting_summary": """Meeting summary: decisions, action items (owner + due if unknown say TBD), parking lot.""",
    "followup_reminders": """List who to follow up with, channel, suggested message angle, and relative timing.""",
    "learning_planner": """Today's learning block: 1 focus skill, 2 resources to skim, 1 exercise, time box (e.g. 45m).""",
    "research_news": """Summarize pasted articles/links text: key claims, limitations, why it matters, follow-up reading.""",
}


class DailyOpsState(TypedDict):
    task_type: str
    user_context: str
    optional_focus: str  # e.g. "Friday", timezone, project name
    draft_json: dict
    report: dict
    logs: Annotated[List[str], operator.add]


def prepare(state: DailyOpsState) -> dict:
    t = state.get("task_type") or "morning_summary"
    label = TASK_LABELS.get(t, t)
    ctx = (state.get("user_context") or "").strip()
    if len(ctx) < 12:
        return {
            "report": {"error": "Paste more context (e.g. emails, notes, ticket list) — at least one short paragraph."},
            "draft_json": {},
            "logs": ["❌ Context too short"],
        }
    return {
        "logs": [f"📋 Task: {label}", f"📏 Context length: {len(ctx)} chars"],
    }


def synthesize(state: DailyOpsState) -> dict:
    if state.get("report", {}).get("error"):
        return {}

    task_type = state.get("task_type") or "morning_summary"
    instruction = TASK_INSTRUCTIONS.get(task_type, TASK_INSTRUCTIONS["morning_summary"])
    ctx = (state.get("user_context") or "").strip()
    focus = (state.get("optional_focus") or "").strip()
    focus_line = f"\nUser focus / constraints: {focus}" if focus else ""

    llm = get_llm(temperature=0.35)
    prompt = f"""{instruction}
{focus_line}

--- USER PASTED CONTEXT ---
{ctx[:120000]}
--- END CONTEXT ---

Return ONLY valid JSON with this shape (fill arrays even if short, use [] if nothing):
{{
  "taskType": "{task_type}",
  "title": "short headline for this deliverable",
  "summary": "2-5 sentence overview",
  "sections": [
    {{"heading": "string", "bullets": ["string"]}}
  ],
  "actionItems": [
    {{"task": "string", "owner": "string or TBD", "due": "string or TBD", "priority": "high|medium|low"}}
  ],
  "followUpReminders": [
    {{"when": "string", "what": "string", "channel": "string or TBD"}}
  ],
  "quickWins": ["optional strings"],
  "risksOrBlockers": ["optional strings"]
}}"""

    response = llm.invoke(prompt)
    text = response.content if hasattr(response, "content") else str(response)
    parsed = safe_json_parse(
        text,
        {
            "taskType": task_type,
            "title": "Daily Ops",
            "summary": text[:500] if text else "",
            "sections": [],
            "actionItems": [],
            "followUpReminders": [],
            "quickWins": [],
            "risksOrBlockers": [],
        },
    )

    report = {
        "taskType": parsed.get("taskType", task_type),
        "taskLabel": TASK_LABELS.get(task_type, task_type),
        "title": parsed.get("title", "Daily Ops"),
        "summary": parsed.get("summary", ""),
        "sections": parsed.get("sections", []),
        "actionItems": parsed.get("actionItems", []),
        "followUpReminders": parsed.get("followUpReminders", []),
        "quickWins": parsed.get("quickWins", []),
        "risksOrBlockers": parsed.get("risksOrBlockers", []),
    }

    return {
        "draft_json": parsed,
        "report": report,
        "logs": ["✅ Synthesized deliverable"],
    }


def build_daily_ops_agent():
    workflow = StateGraph(DailyOpsState)
    workflow.add_node("prepare", prepare)
    workflow.add_node("synthesize", synthesize)

    workflow.set_entry_point("prepare")
    workflow.add_edge("prepare", "synthesize")
    workflow.add_edge("synthesize", END)

    return workflow.compile()


daily_ops_agent = build_daily_ops_agent()
