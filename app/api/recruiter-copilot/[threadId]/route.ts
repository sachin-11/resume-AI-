/**
 * GET    /api/recruiter-copilot/[threadId] — conversation history (to restore the chat on reload)
 * DELETE /api/recruiter-copilot/[threadId] — permanently delete the conversation
 * Both are scoped to the signed-in user by agent-service (thread key = user id + thread id).
 */
import { NextRequest, NextResponse } from "next/server";
import { AGENT_SECRET, AGENT_URL, THREAD_ID_RE, copilotUser } from "@/lib/copilot-agent";

async function proxy(method: "GET" | "DELETE", ctx: { params: Promise<{ threadId: string }> }) {
  const user = await copilotUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await ctx.params;
  if (!THREAD_ID_RE.test(threadId)) return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });

  try {
    const url = `${AGENT_URL}/threads/${threadId}?user_id=${encodeURIComponent(user.id)}`;
    const res = await fetch(url, {
      method,
      headers: { "x-agent-secret": AGENT_SECRET },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Copilot unavailable" }, { status: 502 });
  }
}

export function GET(_req: NextRequest, ctx: { params: Promise<{ threadId: string }> }) {
  return proxy("GET", ctx);
}

export function DELETE(_req: NextRequest, ctx: { params: Promise<{ threadId: string }> }) {
  return proxy("DELETE", ctx);
}
