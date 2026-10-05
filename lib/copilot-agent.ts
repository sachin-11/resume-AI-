/**
 * Shared bits for the Recruitment Copilot routes, which proxy to agent-service's
 * multi-turn orchestrator (/orchestrate, /threads/:id). Auth headers: lib/agentAuth.ts.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, type UserRole } from "@/lib/permissions";
import type { AgentCaller } from "@/lib/agentAuth";

export const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
// Same rule agent-service enforces on thread ids.
export const THREAD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Signed-in recruiter/admin, or null. Threads are always scoped to this user's id. */
export async function copilotUser(): Promise<AgentCaller | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  if (!can(session.user.role as UserRole, "useRecruiterCopilot")) return null;
  return { id: session.user.id, orgId: session.user.orgId, role: session.user.role };
}
