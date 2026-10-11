/**
 * OAuth client identification for the MCP Authorization Server.
 *
 * Two kinds of client_id:
 *   - https URL → OAuth Client ID Metadata Document (CIMD, the MCP default): we fetch
 *     the JSON at that URL and trust only what it says (client_id must equal the URL).
 *   - "dcr_…" → registered earlier via Dynamic Client Registration (deprecated, kept
 *     for older clients), stored in OAuthClient.
 *
 * Fetching a URL a stranger gave us is a Server-Side Request Forgery risk, so the
 * CIMD fetch is fenced: https only, the host must resolve only to public IPs (no
 * loopback / private / link-local / cloud-metadata ranges), no redirects followed,
 * 5s timeout, 10 KB body cap, JSON only, short cache. (Residual risk: DNS can change
 * between our lookup and the connection — the private-IP check narrows but does not
 * close that window.)
 */
import { lookup } from "dns/promises";
import { isIP } from "net";
import { db } from "@/lib/db";

export class OAuthClientError extends Error {
  constructor(public code: "invalid_client" | "invalid_request" | "invalid_redirect_uri", message: string) {
    super(message);
  }
}

export interface ResolvedClient {
  id: string;
  name: string;
  redirectUris: string[];
  kind: "cimd" | "dcr";
  clientUri?: string;
  logoUri?: string;
}

const CIMD_TIMEOUT_MS = 5_000;
const CIMD_MAX_BYTES = 10_000;
const CIMD_CACHE_MS = 10 * 60_000;
const cache = new Map<string, { client: ResolvedClient; until: number }>();

/** Dev-only escape hatch so the OAuth flow can be tested against a CIMD document on localhost. */
function allowLocalCimd(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.MCP_OAUTH_ALLOW_LOCAL_CIMD === "true";
}

// ── Redirect URIs: https, or loopback http for native apps (OAuth 2.1 / MCP) ──
export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}

export function isLoopbackRedirect(uri: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(uri).hostname);
  } catch {
    return false;
  }
}

// ── SSRF guard ───────────────────────────────────────────────────
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") ||
    v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new OAuthClientError("invalid_client", "Client metadata host does not resolve");
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new OAuthClientError("invalid_client", "Client metadata host resolves to a non-public address");
  }
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CIMD_MAX_BYTES) {
      await reader.cancel();
      throw new OAuthClientError("invalid_client", "Client metadata document is too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchMetadataDocument(clientId: string): Promise<ResolvedClient> {
  const hit = cache.get(clientId);
  if (hit && hit.until > Date.now()) return hit.client;

  const url = new URL(clientId);
  const localDev = allowLocalCimd() && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDev) throw new OAuthClientError("invalid_client", "client_id URL must use https");
  if (url.pathname === "/" || !url.pathname) throw new OAuthClientError("invalid_client", "client_id URL must have a path");
  if (url.username || url.password || url.hash) throw new OAuthClientError("invalid_client", "client_id URL is not allowed");
  if (!localDev) await assertPublicHost(url.hostname);

  let res: Response;
  try {
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(CIMD_TIMEOUT_MS), headers: { Accept: "application/json" } });
  } catch {
    throw new OAuthClientError("invalid_client", "Could not fetch the client metadata document");
  }
  if (res.status >= 300 && res.status < 400) throw new OAuthClientError("invalid_client", "Client metadata document redirects");
  if (!res.ok) throw new OAuthClientError("invalid_client", `Client metadata document returned ${res.status}`);
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    throw new OAuthClientError("invalid_client", "Client metadata document is not JSON");
  }

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(await readCapped(res));
  } catch (err) {
    if (err instanceof OAuthClientError) throw err;
    throw new OAuthClientError("invalid_client", "Client metadata document is not valid JSON");
  }
  if (doc.client_id !== clientId) throw new OAuthClientError("invalid_client", "client_id in the document does not match its URL");
  if (typeof doc.client_name !== "string" || !doc.client_name.trim()) {
    throw new OAuthClientError("invalid_client", "Client metadata document has no client_name");
  }
  const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!redirectUris.length || !redirectUris.every(isAllowedRedirectUri)) {
    throw new OAuthClientError("invalid_client", "redirect_uris must be https or loopback http URLs");
  }
  if (doc.token_endpoint_auth_method && doc.token_endpoint_auth_method !== "none") {
    throw new OAuthClientError("invalid_client", "Only public clients (token_endpoint_auth_method=none) are supported");
  }

  const client: ResolvedClient = {
    id: clientId,
    name: doc.client_name.trim().slice(0, 80),
    redirectUris,
    kind: "cimd",
    clientUri: typeof doc.client_uri === "string" ? doc.client_uri : undefined,
    logoUri: typeof doc.logo_uri === "string" && doc.logo_uri.startsWith("https://") ? doc.logo_uri : undefined,
  };
  cache.set(clientId, { client, until: Date.now() + CIMD_CACHE_MS });
  return client;
}

export async function resolveClient(clientId: string | null | undefined): Promise<ResolvedClient> {
  if (!clientId) throw new OAuthClientError("invalid_request", "client_id is required");
  if (/^https?:\/\//i.test(clientId)) return fetchMetadataDocument(clientId);
  const row = await db.oAuthClient.findUnique({ where: { id: clientId } });
  if (!row) throw new OAuthClientError("invalid_client", "Unknown client_id");
  return { id: row.id, name: row.name, redirectUris: row.redirectUris, kind: "dcr" };
}

/** Exact-match redirect check (no prefix or pattern matching — open-redirect defence). */
export function assertRedirectUri(client: ResolvedClient, redirectUri: string | null | undefined): string {
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    throw new OAuthClientError("invalid_redirect_uri", "redirect_uri is not registered for this client");
  }
  return redirectUri;
}
