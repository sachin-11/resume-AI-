/**
 * MCP authorization — the Resume-AI MCP server is an OAuth 2.1 *Resource Server*.
 *
 * Access tokens are short-lived JWTs issued by this app's own Authorization
 * Server (app/api/oauth/*). This module verifies them for the MCP endpoint:
 *   - signature (HS256, MCP_TOKEN_SECRET) and expiry,
 *   - issuer = this app,
 *   - audience = the MCP resource URL (RFC 8707 resource indicator) — a token
 *     minted for any other resource is refused, which is what stops a token
 *     being replayed against us ("confused deputy" / token passthrough),
 *   - scopes, mapped per tool (see SCOPES).
 *
 * The MCP server never forwards these tokens anywhere. When a tool needs the
 * agent-service it signs a fresh service JWT for the same user (lib/agentAuth).
 */
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import type { AuthInfo, OAuthTokenVerifier } from "@modelcontextprotocol/server";

/** Scope → what it allows. Least privilege: reading never implies writing. */
export const SCOPES = {
  "candidates:read": "Read your campaigns, candidates, interview scores and open slots",
  "screening:run": "Run AI screening and ranking on your candidates",
  "interviews:write": "Book interview slots and email candidates (asks you to confirm each time)",
} as const;
export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];
export const DEFAULT_SCOPES: Scope[] = ["candidates:read"];

const ACCESS_TOKEN_TTL_S = 60 * 60;

export function appBaseUrl(): string {
  return (process.env.MCP_PUBLIC_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** The MCP server's resource identifier (RFC 8707) — also the `aud` of every token for it. */
export function mcpResourceUrl(): URL {
  return new URL(`${appBaseUrl()}/api/mcp`);
}

function signingKey(): Uint8Array {
  const secret = process.env.MCP_TOKEN_SECRET ?? "";
  if (secret.length < 32) throw new Error("MCP_TOKEN_SECRET must be set (at least 32 characters)");
  return new TextEncoder().encode(secret);
}

export interface McpPrincipal {
  userId: string;
  role: string | null;
  orgId: string | null;
  clientId: string;
  scopes: Scope[];
}

export async function mintAccessToken(p: McpPrincipal, ttlSeconds = ACCESS_TOKEN_TTL_S): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({ scope: p.scopes.join(" "), client_id: p.clientId, role: p.role, org: p.orgId })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(appBaseUrl())
    .setAudience(mcpResourceUrl().href)
    .setSubject(p.userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(signingKey());
  return { token, expiresIn: ttlSeconds };
}

/** Token verifier the SDK's bearer gate calls; fills AuthInfo.resource from `aud` for the audience check. */
export const tokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const key = signingKey();   // a missing secret is our misconfiguration → stays a 500
    let verified;
    try {
      verified = await jwtVerify(token, key, { algorithms: ["HS256"], issuer: appBaseUrl(), typ: "at+jwt" });
    } catch (err) {
      // Malformed, forged, expired, wrong issuer… → 401 invalid_token, never a 500 (the SDK's bearer
      // gate answers 401 only for OAuthError). The client then refreshes or re-authorizes.
      if (err instanceof joseErrors.JOSEError) throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired access token");
      throw err;
    }
    const { payload, protectedHeader } = verified;
    if (protectedHeader.typ !== "at+jwt" || typeof payload.sub !== "string") {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Not an access token");
    }
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    return {
      token,
      clientId: String(payload.client_id ?? ""),
      scopes: String(payload.scope ?? "").split(" ").filter(Boolean),
      expiresAt: payload.exp,
      resource: aud ? new URL(aud) : undefined,
      extra: { userId: payload.sub, role: payload.role ?? null, orgId: payload.org ?? null },
    };
  },
};

/** The signed-in recruiter behind an MCP request (set by the bearer gate in app/api/mcp). */
export function principalOf(authInfo: AuthInfo | undefined): McpPrincipal {
  const extra = (authInfo?.extra ?? {}) as { userId?: string; role?: string | null; orgId?: string | null };
  if (!authInfo || !extra.userId) throw new Error("Unauthenticated MCP request");
  return {
    userId: extra.userId,
    role: extra.role ?? null,
    orgId: extra.orgId ?? null,
    clientId: authInfo.clientId,
    scopes: authInfo.scopes.filter((s): s is Scope => s in SCOPES),
  };
}
