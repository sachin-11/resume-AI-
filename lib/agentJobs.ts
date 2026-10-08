/**
 * Server-side: queue a long agent run on agent-service as a background job.
 * The route returns { jobId } right away; the browser polls /api/agent-jobs/[id]
 * (see lib/agentJobClient.ts), so no request stays open for the whole run.
 */
import { NextResponse } from "next/server";
import { agentHeaders, type AgentCaller } from "@/lib/agentAuth";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export type AgentJobName = "screen-candidate" | "panel-interview" | "orchestrate" | "campaign-shortlist" | "bulk-screening";

export async function submitAgentJob(
  caller: AgentCaller,
  agent: AgentJobName,
  input: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<NextResponse> {
  try {
    const res = await fetch(`${AGENT_URL}/jobs`, {
      method: "POST",
      headers: await agentHeaders(caller),
      body: JSON.stringify({ agent, input, idempotency_key: idempotencyKey }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "Could not start the agent";
      return NextResponse.json({ error: detail }, { status: res.status });
    }
    return NextResponse.json({ jobId: data.job_id }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent service unavailable" }, { status: 502 });
  }
}
