/**
 * POST /api/agents/daily-ops
 * Daily Ops Agent — summaries, standup, digests from pasted context
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VALID_TASKS = new Set([
  "morning_summary",
  "gmail_summarize",
  "slack_whatsapp_summarize",
  "jira_check",
  "daily_standup",
  "calendar_reminders",
  "notes_organize",
  "expense_tracking",
  "fitness_reminders",
  "coding_tasks",
  "github_pr_review",
  "auto_document",
  "meeting_summary",
  "followup_reminders",
  "learning_planner",
  "research_news",
]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
  const AGENT_SECRET = process.env.AGENT_SECRET ?? "dev-secret-change-in-production";

  const body = await req.json();
  const taskType = typeof body.taskType === "string" && VALID_TASKS.has(body.taskType)
    ? body.taskType
    : "morning_summary";
  const userContext = typeof body.userContext === "string" ? body.userContext : "";
  const optionalFocus = typeof body.optionalFocus === "string" ? body.optionalFocus : "";

  if (!userContext.trim() || userContext.trim().length < 12) {
    return NextResponse.json(
      { error: "Paste your emails, notes, tickets, or chat export (at least a short paragraph)." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/daily-ops`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agent-secret": AGENT_SECRET },
      body: JSON.stringify({
        task_type: taskType,
        user_context: userContext.slice(0, 120_000),
        optional_focus: optionalFocus.slice(0, 2000),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: typeof data.detail === "string" ? data.detail : data.error ?? "Agent failed" },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed" },
      { status: 500 }
    );
  }
}
