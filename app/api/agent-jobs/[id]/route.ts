/**
 * GET /api/agent-jobs/[id]
 * Status of a background agent job: queued | running (with node-by-node progress)
 * | succeeded (with result) | failed (with error). Only the submitting user can see it.
 *
 * Token usage is logged to AiUsageLog the first time a finished job is seen —
 * agent-service hands the usage out exactly once, so polling can't double-count it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { agentHeaders } from "@/lib/agentAuth";
import { logAgentUsage } from "@/lib/agentUsage";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
const JOB_ID_RE = /^[a-f0-9]{32}$/;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!JOB_ID_RE.test(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  try {
    const headers = await agentHeaders(session.user);
    const res = await fetch(`${AGENT_URL}/jobs/${id}`, { headers, signal: AbortSignal.timeout(10_000) });
    const job = await res.json();
    if (!res.ok) return NextResponse.json({ error: job.detail ?? "Job not found" }, { status: res.status });

    if (job.status === "succeeded") {
      const ack = await fetch(`${AGENT_URL}/jobs/${id}/ack-usage`, {
        method: "POST", headers, signal: AbortSignal.timeout(10_000),
      }).then((r) => r.json()).catch(() => null);
      if (ack?.first) logAgentUsage(ack.usage, { userId: session.user.id, feature: `agent:${job.agent}` });
    }
    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent service unavailable" }, { status: 502 });
  }
}
