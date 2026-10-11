/**
 * MCP → agent-service bridge. Long agent runs are background jobs on
 * agent-service (POST /jobs, GET /jobs/:id); this module submits and polls
 * them on behalf of the MCP caller.
 *
 * - No token passthrough: the recruiter's MCP access token never leaves this
 *   server. agent-service gets its own short-lived service JWT for the same
 *   user (lib/agentAuth), so a token issued for one audience is never
 *   replayed to another.
 * - Progress: each graph node the job reaches is relayed to the MCP client as
 *   `notifications/progress` on the request's own response stream (when the
 *   client sent a progressToken).
 * - Cancellation: the client's `notifications/cancelled` aborts ctx.mcpReq.signal;
 *   polling stops at once.
 */
import type { ServerContext } from "@modelcontextprotocol/server";
import { agentHeaders } from "@/lib/agentAuth";
import type { McpPrincipal } from "@/lib/mcp/auth";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export class AgentServiceError extends Error {}

interface AgentJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: { node: string; count?: number }[];
  result: Record<string, unknown> | null;
  error: string | null;
}

const NODE_LABELS: Record<string, string> = {
  extract_info: "Reading the resume",
  fetch_github: "Checking GitHub",
  match_jd: "Matching against the job",
  build_report: "Writing the report",
  assess_candidate: "Assessing candidates",
  rank_candidates: "Ranking the shortlist",
};

function callerOf(p: McpPrincipal) {
  return { id: p.userId, orgId: p.orgId, role: p.role };
}

export async function submitJob(p: McpPrincipal, agent: string, input: Record<string, unknown>, idempotencyKey?: string): Promise<string> {
  const res = await fetch(`${AGENT_URL}/jobs`, {
    method: "POST",
    headers: await agentHeaders(callerOf(p)),
    body: JSON.stringify({ agent, input, idempotency_key: idempotencyKey }),
    signal: AbortSignal.timeout(60_000),   // a sleeping free-tier instance needs ~50s to wake
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AgentServiceError(typeof data.detail === "string" ? data.detail : `Agent service error (${res.status})`);
  return data.job_id as string;
}

export async function getJob(p: McpPrincipal, jobId: string): Promise<AgentJob> {
  if (!/^[a-f0-9]{32}$/.test(jobId)) throw new AgentServiceError("Invalid job handle");
  const res = await fetch(`${AGENT_URL}/jobs/${jobId}`, { headers: await agentHeaders(callerOf(p)), signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AgentServiceError(typeof data.detail === "string" ? data.detail : `Agent service error (${res.status})`);
  return data as AgentJob;
}

/** Poll a job to completion, relaying node-by-node progress; honours cancellation and a deadline. */
export async function waitForJob(p: McpPrincipal, jobId: string, ctx: ServerContext, deadlineMs = 25_000): Promise<AgentJob | null> {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  const started = Date.now();
  let lastSent = "";
  let step = 0;
  while (Date.now() - started < deadlineMs) {
    if (ctx.mcpReq.signal.aborted) throw new AgentServiceError("Cancelled by the client");
    const job = await getJob(p, jobId);
    const node = job.progress.at(-1);
    const label = node ? `${NODE_LABELS[node.node] ?? node.node}${(node.count ?? 1) > 1 ? ` (${node.count})` : ""}` : "Queued";
    if (progressToken !== undefined && label !== lastSent) {
      lastSent = label;
      step += 1;
      await ctx.mcpReq.notify({ method: "notifications/progress", params: { progressToken, progress: step, message: label } });
    }
    if (job.status === "succeeded" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;   // still running — the caller hands back a handle to poll
}
