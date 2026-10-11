/**
 * OAuth 2.1 Authorization Server for the Resume-AI MCP server.
 *
 * Flow (authorization code + PKCE, public clients):
 *   /api/oauth/authorize  validate client, redirect_uri (exact), PKCE S256, resource, scopes
 *                         → a signed, 10-minute "pending request" → /oauth/consent (login required)
 *   /oauth/consent        the recruiter sees who is asking (client name, client_id host,
 *                         redirect host, localhost warning) and which scopes → approve / deny
 *   /api/oauth/consent    issue a single-use code (hashed, 60s, PKCE-bound) → redirect with
 *                         code + state + iss (RFC 9207, mix-up defence)
 *   /api/oauth/token      code + code_verifier → access token (1h JWT, aud = MCP resource)
 *                         + refresh token (hashed, rotated on every use; reuse revokes the family)
 *
 * Tokens are only ever stored as SHA-256 hashes.
 */
import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { ALL_SCOPES, DEFAULT_SCOPES, SCOPES, appBaseUrl, mcpResourceUrl, mintAccessToken, type Scope } from "@/lib/mcp/auth";

export const OFFLINE_ACCESS = "offline_access";
const CODE_TTL_MS = 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
const PENDING_TTL_S = 600;

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const opaque = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

export function issuer(): string {
  return appBaseUrl();
}

// ── Discovery documents ──────────────────────────────────────────
export function authorizationServerMetadata() {
  const iss = issuer();
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/api/oauth/authorize`,
    token_endpoint: `${iss}/api/oauth/token`,
    registration_endpoint: `${iss}/api/oauth/register`,       // DCR — deprecated, for older clients
    revocation_endpoint: `${iss}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],                 // PKCE; clients MUST refuse without it
    token_endpoint_auth_methods_supported: ["none"],            // public clients
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...ALL_SCOPES, OFFLINE_ACCESS],
    authorization_response_iss_parameter_supported: true,       // RFC 9207
    client_id_metadata_document_supported: true,                // CIMD
    service_documentation: `${iss}/mcp`,
  };
}

/** OIDC discovery shape for clients that look there first (we issue no ID tokens). */
export function openIdConfiguration() {
  return {
    ...authorizationServerMetadata(),
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["none"],
  };
}

// ── Resource indicator (RFC 8707) ────────────────────────────────
export function canonicalResource(raw: string | null | undefined): string {
  const expected = mcpResourceUrl();
  if (!raw) return expected.href;   // clients MUST send it; tolerate omission by binding to our only resource
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new OAuthError("invalid_target", "resource is not a valid URI");
  }
  const norm = (x: URL) => `${x.protocol.toLowerCase()}//${x.host.toLowerCase()}${x.pathname.replace(/\/$/, "")}`;
  if (u.hash || norm(u) !== norm(expected)) throw new OAuthError("invalid_target", "This server only issues tokens for its MCP endpoint");
  return expected.href;
}

// ── Scopes ───────────────────────────────────────────────────────
export function parseScopes(raw: string | null | undefined): { scopes: Scope[]; offline: boolean } {
  const requested = (raw ?? "").split(/\s+/).filter(Boolean);
  const unknown = requested.filter((s) => !(s in SCOPES) && s !== OFFLINE_ACCESS);
  if (unknown.length) throw new OAuthError("invalid_scope", `Unknown scope(s): ${unknown.join(" ")}`);
  const scopes = requested.filter((s): s is Scope => s in SCOPES);
  return { scopes: scopes.length ? scopes : [...DEFAULT_SCOPES], offline: requested.includes(OFFLINE_ACCESS) };
}

// ── Pending authorization request (signed, carried to the consent screen) ──
export interface PendingRequest {
  clientId: string;
  clientName: string;
  clientKind: "cimd" | "dcr";
  redirectUri: string;
  state?: string;
  scopes: Scope[];
  offline: boolean;
  codeChallenge: string;
  resource: string;
}

function requestKey(): Uint8Array {
  const secret = process.env.MCP_TOKEN_SECRET ?? "";
  if (secret.length < 32) throw new Error("MCP_TOKEN_SECRET must be set (at least 32 characters)");
  return new TextEncoder().encode(`oauth-pending:${secret}`);
}

export async function signPending(p: PendingRequest): Promise<string> {
  return new SignJWT({ ...p }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${PENDING_TTL_S}s`)
    .setAudience("oauth-consent").sign(requestKey());
}

export async function verifyPending(token: string): Promise<PendingRequest> {
  try {
    const { payload } = await jwtVerify(token, requestKey(), { audience: "oauth-consent", algorithms: ["HS256"] });
    return payload as unknown as PendingRequest;
  } catch {
    throw new OAuthError("invalid_request", "This authorization request expired — start again from your MCP client");
  }
}

/** Where the authorization response goes: redirect_uri + code|error + state + iss. */
export function authorizationResponseUrl(p: Pick<PendingRequest, "redirectUri" | "state">, params: Record<string, string>): string {
  const u = new URL(p.redirectUri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (p.state) u.searchParams.set("state", p.state);
  u.searchParams.set("iss", issuer());
  return u.toString();
}

// ── Authorization codes ──────────────────────────────────────────
export async function issueCode(userId: string, p: PendingRequest): Promise<string> {
  const code = opaque("rac");
  await db.oAuthCode.create({
    data: {
      codeHash: sha256(code), clientId: p.clientId, userId, redirectUri: p.redirectUri,
      scopes: p.offline ? [...p.scopes, OFFLINE_ACCESS] : p.scopes,
      codeChallenge: p.codeChallenge, resource: p.resource, expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function userClaims(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, ownedOrg: { select: { id: true } }, teamMembership: { select: { orgId: true, role: true } } },
  });
  if (!u) throw new OAuthError("invalid_grant", "User no longer exists");
  return { role: u.teamMembership?.role ?? u.role ?? null, orgId: u.ownedOrg?.id ?? u.teamMembership?.orgId ?? null };
}

async function tokenResponse(userId: string, clientId: string, clientName: string, scopes: string[], resource: string, familyId?: string) {
  const resourceScopes = scopes.filter((s): s is Scope => s in SCOPES);
  const claims = await userClaims(userId);
  const { token, expiresIn } = await mintAccessToken({ userId, clientId, scopes: resourceScopes, ...claims });
  const body: Record<string, unknown> = { access_token: token, token_type: "Bearer", expires_in: expiresIn, scope: scopes.join(" ") };
  // Refresh tokens only when asked for (offline_access) — never assumed by clients, per MCP.
  if (scopes.includes(OFFLINE_ACCESS)) {
    const refresh = opaque("rrt");
    await db.oAuthRefreshToken.create({
      data: { tokenHash: sha256(refresh), familyId: familyId ?? randomBytes(16).toString("hex"), clientId, clientName, userId,
              scopes, resource, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    body.refresh_token = refresh;
  }
  return body;
}

export async function exchangeCode(params: { code: string; codeVerifier: string; clientId: string; redirectUri: string;
                                             resource: string; clientName: string }) {
  const row = await db.oAuthCode.findUnique({ where: { codeHash: sha256(params.code) } });
  if (!row) throw new OAuthError("invalid_grant", "Unknown authorization code");
  // Single use, claimed atomically. A second redemption means the code leaked: revoke what it produced.
  const claimed = await db.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) {
    await db.oAuthRefreshToken.updateMany({ where: { userId: row.userId, clientId: row.clientId, revokedAt: null,
                                                     createdAt: { gte: row.createdAt } }, data: { revokedAt: new Date() } });
    throw new OAuthError("invalid_grant", "Authorization code was already used");
  }
  if (row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Authorization code expired");
  if (row.clientId !== params.clientId) throw new OAuthError("invalid_grant", "Code was issued to another client");
  if (row.redirectUri !== params.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri does not match");
  if (row.resource !== params.resource) throw new OAuthError("invalid_target", "resource does not match the authorization request");
  if (!params.codeVerifier || pkceS256(params.codeVerifier) !== row.codeChallenge) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }
  return tokenResponse(row.userId, row.clientId, params.clientName, row.scopes, row.resource);
}

export async function refresh(params: { refreshToken: string; clientId: string; resource: string; scope?: string }) {
  const row = await db.oAuthRefreshToken.findUnique({ where: { tokenHash: sha256(params.refreshToken) } });
  if (!row || row.clientId !== params.clientId) throw new OAuthError("invalid_grant", "Unknown refresh token");
  if (row.revokedAt) throw new OAuthError("invalid_grant", "Refresh token was revoked");
  if (row.rotatedAt) {
    // Reuse of an already-rotated token: assume theft, revoke the whole family (OAuth 2.1 §4.3.1).
    await db.oAuthRefreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new OAuthError("invalid_grant", "Refresh token reuse detected — the session was revoked");
  }
  if (row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Refresh token expired");
  if (row.resource !== params.resource) throw new OAuthError("invalid_target", "resource does not match");
  let scopes = row.scopes;
  if (params.scope) {   // may only narrow, never widen
    const asked = params.scope.split(/\s+/).filter(Boolean);
    if (asked.some((s) => !row.scopes.includes(s))) throw new OAuthError("invalid_scope", "Cannot widen scopes on refresh");
    scopes = asked.includes(OFFLINE_ACCESS) ? asked : [...asked, OFFLINE_ACCESS];
  }
  const rotated = await db.oAuthRefreshToken.updateMany({ where: { id: row.id, rotatedAt: null }, data: { rotatedAt: new Date() } });
  if (rotated.count !== 1) throw new OAuthError("invalid_grant", "Refresh token was already used");
  return tokenResponse(row.userId, row.clientId, row.clientName, scopes, row.resource, row.familyId);
}

export async function revokeRefreshToken(token: string, clientId?: string): Promise<void> {
  const row = await db.oAuthRefreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || (clientId && row.clientId !== clientId)) return;   // RFC 7009: unknown tokens are not an error
  await db.oAuthRefreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

// ── Dynamic Client Registration (deprecated in MCP; for older clients) ──
export async function registerClient(meta: { client_name?: unknown; redirect_uris?: unknown; application_type?: unknown;
                                             token_endpoint_auth_method?: unknown; grant_types?: unknown }) {
  const { isAllowedRedirectUri } = await import("@/lib/oauth/clients");
  const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!redirectUris.length || redirectUris.length > 10 || !redirectUris.every(isAllowedRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be 1-10 https or loopback http URLs");
  }
  if (meta.token_endpoint_auth_method && meta.token_endpoint_auth_method !== "none") {
    throw new OAuthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are supported");
  }
  const applicationType = meta.application_type === "web" ? "web" : "native";
  const name = typeof meta.client_name === "string" && meta.client_name.trim() ? meta.client_name.trim().slice(0, 80) : "Unnamed MCP client";
  const id = `dcr_${randomBytes(16).toString("hex")}`;
  await db.oAuthClient.create({ data: { id, name, redirectUris, applicationType } });
  return {
    client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: redirectUris,
    application_type: applicationType, token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  };
}
