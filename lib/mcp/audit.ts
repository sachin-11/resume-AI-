/**
 * Audit trail for MCP tool calls: who (user + OAuth client), which tool, outcome,
 * duration. Arguments are never logged raw (they can carry candidate data) —
 * only their names and a SHA-256, enough to tell two calls apart.
 * One JSON line per call on stdout → the hosting log pipeline (CloudWatch on Amplify).
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
}

export function audit(e: AuditEvent): void {
  const argNames = e.args && typeof e.args === "object" ? Object.keys(e.args as object).sort() : [];
  const argsSha = createHash("sha256").update(JSON.stringify(e.args ?? null)).digest("hex").slice(0, 16);
  console.info(JSON.stringify({
    event: "mcp_tool_call", at: new Date().toISOString(), tool: e.tool, user_id: e.userId, client_id: e.clientId,
    arg_names: argNames, args_sha256: argsSha, ok: e.ok, ms: e.ms, ...(e.error ? { error: e.error } : {}),
  }));
}
