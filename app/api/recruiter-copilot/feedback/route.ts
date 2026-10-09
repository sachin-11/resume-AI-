/**
 * POST /api/recruiter-copilot/feedback
 * Thumbs up/down on a Copilot answer. Forwarded to agent-service, where
 * thumbs-down answers feed the eval dataset (agent-service/evals/harvest_feedback.py).
 *
 * Body: { rating: "up"|"down", comment?, question?, answer?, version?, threadId? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agentHeaders } from "@/lib/agentAuth";
import { AGENT_URL, THREAD_ID_RE, copilotUser } from "@/lib/copilot-agent";

const schema = z.object({
  rating: z.enum(["up", "down"]),
  comment: z.string().max(1000).optional(),
  question: z.string().max(8000).optional(),
  answer: z.string().max(8000).optional(),
  version: z.string().max(32).optional(),
  threadId: z.string().regex(THREAD_ID_RE).optional(),
});

export async function POST(req: NextRequest) {
  const user = await copilotUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const body = parsed.data;

  try {
    const res = await fetch(`${AGENT_URL}/feedback`, {
      method: "POST",
      headers: await agentHeaders(user),
      body: JSON.stringify({
        agent: "orchestrate",
        rating: body.rating,
        comment: body.comment ?? "",
        input: body.question ?? "",
        output: body.answer ?? "",
        version: body.version,
        thread_id: body.threadId,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return NextResponse.json({ error: "Could not save feedback" }, { status: res.status });
    return NextResponse.json(await res.json(), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save feedback" }, { status: 502 });
  }
}
