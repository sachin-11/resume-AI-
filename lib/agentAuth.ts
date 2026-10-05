/**
 * Auth headers for calls to agent-service.
 *
 * Each request carries a short-lived HS256 JWT (signed with AGENT_SECRET) that
 * says which user — and which org — the call is made for. agent-service takes
 * the user id from the verified token, never from the request body.
 *
 * Migration: the legacy `x-agent-secret` header is still sent so that whichever
 * of the two services deploys first keeps working. Once agent-service with
 * token support is live everywhere, stop sending it (AGENT_SEND_LEGACY_SECRET=false)
 * and set AGENT_ALLOW_LEGACY_SECRET=false on agent-service.
 */
import { randomUUID } from "crypto";
import { SignJWT } from "jose";

const ISSUER = "resume-ai-web";
const AUDIENCE = "agent-service";
const TOKEN_TTL_SECONDS = 120;

export interface AgentCaller {
  id: string;
  orgId?: string | null;
  role?: string | null;
}

export async function agentHeaders(caller: AgentCaller): Promise<Record<string, string>> {
  // No insecure fallback — an unset AGENT_SECRET must fail auth on agent-service.
  const secret = process.env.AGENT_SECRET ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (secret) {
    const token = await new SignJWT({ org: caller.orgId ?? null, role: caller.role ?? null })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(caller.id)
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
      .setJti(randomUUID())
      .sign(new TextEncoder().encode(secret));
    headers.Authorization = `Bearer ${token}`;
  }

  if (process.env.AGENT_SEND_LEGACY_SECRET !== "false") {
    headers["x-agent-secret"] = secret;
  }
  return headers;
}
