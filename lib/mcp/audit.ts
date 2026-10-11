/**
 * Audit trail for MCP tool calls: who (user + OAuth client), which tool, outcome,
 * duration. Arguments are never logged raw (they can carry candidate data) —
 * only their names and a SHA-256, enough to tell two calls apart.
 * One JSON line per call on stdout → the hosting log pipeline (CloudWatch on Amplify).
 *
 * Distributed tracing (SEP-414): a client may send W3C trace context in the request's
 * `_meta.traceparent`. We log its trace id, so one search finds both sides of a call
 * (e.g. agent-service's `mcp_call trace_id=…` line and this one).
 */
import { createHash } from "crypto";

export interface AuditEvent {
  tool: string;
  userId: string;
  clientId: string;
  args: unknown;
  ok: boolean;
  ms: number;
  error?: string;
  traceparent?: unknown;
}

const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

/** trace id + parent span id from a W3C traceparent; anything malformed is ignored (it's client input). */
export function traceOf(traceparent: unknown): { trace_id: string; parent_span_id: string } | undefined {
  const m = typeof traceparent === "string" ? TRACEPARENT.exec(traceparent) : null;
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return undefined;
  return { trace_id: m[1], parent_span_id: m[2] };
}

export function audit(e: AuditEvent): void {
  const argNames = e.args && typeof e.args === "object" ? Object.keys(e.args as object).sort() : [];
  const argsSha = createHash("sha256").update(JSON.stringify(e.args ?? null)).digest("hex").slice(0, 16);
  console.info(JSON.stringify({
    event: "mcp_tool_call", at: new Date().toISOString(), tool: e.tool, user_id: e.userId, client_id: e.clientId,
    arg_names: argNames, args_sha256: argsSha, ok: e.ok, ms: e.ms, ...(e.error ? { error: e.error } : {}), ...traceOf(e.traceparent),
  }));
}
