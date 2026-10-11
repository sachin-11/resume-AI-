#!/usr/bin/env node
/**
 * End-to-end OAuth 2.1 test of the Resume-AI MCP server, driven by the OFFICIAL MCP client
 * SDK's OAuth support (discovery, registration, PKCE, iss check, token exchange) — i.e. what
 * a real MCP client does. The browser step (login + consent) is simulated with the
 * recruiter's NextAuth session cookie.
 *
 *   node scripts/mcp-oauth-e2e.mjs --url http://localhost:3100/api/mcp --user <userId>
 *
 * Needs NEXTAUTH_SECRET + MCP_TOKEN_SECRET (.env / .env.local); the CIMD part needs the server
 * started with MCP_OAUTH_ALLOW_LOCAL_CIMD=true (dev only — production requires https client ids).
 */
import { createHash, randomBytes } from "crypto";
import { createServer } from "http";
import { existsSync, readFileSync } from "fs";
import { Client, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client";
import { SignJWT } from "jose";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const mcpUrl = new URL(args.url ?? "http://localhost:3100/api/mcp");
const base = mcpUrl.origin;
if (!args.user) { console.error("--user <userId> is required"); process.exit(1); }

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${String(detail).slice(0, 160)}` : ""}`);
  if (!ok) failures += 1;
}

const { encode } = await import("next-auth/jwt");
const sessionCookie = `next-auth.session-token=${await encode({ token: { sub: args.user, id: args.user, role: "recruiter" },
                                                                 secret: process.env.NEXTAUTH_SECRET })}`;
const REDIRECT = "http://127.0.0.1:53682/callback";

/** The recruiter's browser: follow /authorize to the consent screen and press Allow / Deny. */
async function browser(authUrl, decision = "allow") {
  const r1 = await fetch(authUrl, { redirect: "manual" });
  const loc = r1.headers.get("location");
  if (!loc) return { status: r1.status, body: await r1.text() };
  const consent = new URL(loc, base);
  if (consent.pathname !== "/oauth/consent") return { redirect: new URL(loc) };
  const r2 = await fetch(`${base}/api/oauth/consent`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify({ request: consent.searchParams.get("request"), decision }),
  });
  const data = await r2.json();
  return { redirect: new URL(data.redirect) };
}

class TestProvider {
  constructor({ cimdUrl, name = "Resume AI e2e test" } = {}) {
    if (cimdUrl) this.clientMetadataUrl = cimdUrl;
    this.name = name;
    this.authUrls = [];
  }
  get redirectUrl() { return REDIRECT; }
  get clientMetadata() {
    return { client_name: this.name, redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"],
             response_types: ["code"], token_endpoint_auth_method: "none", application_type: "native" };
  }
  clientInformation() { return this._info; }
  saveClientInformation(info) { this._info = info; }
  tokens() { return this._tokens; }
  saveTokens(t) { this._tokens = t; }
  redirectToAuthorization(url) { this.authUrls.push(url); }
  saveCodeVerifier(v) { this._verifier = v; }
  codeVerifier() { return this._verifier; }
  saveDiscoveryState(state) { this._discovery = state; }
  discoveryState() { return this._discovery; }
}

/** Connect with OAuth; on the first 401 run the browser step and finish the code exchange. */
async function connectWithOAuth(provider, decision = "allow") {
  const make = () => new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider });
  const opts = { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: "auto" } };
  const client = new Client({ name: provider.name, version: "1.0.0" }, opts);
  client.setRequestHandler("elicitation/create", async () => ({ action: "accept", content: { confirm: true } }));
  let transport = make();
  try {
    await client.connect(transport);
    return { client, transport };
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;
  }
  const { redirect } = await browser(provider.authUrls.at(-1), decision);
  if (redirect.searchParams.get("error")) return { error: redirect.searchParams, redirect };
  await transport.finishAuth(redirect.searchParams);
  const c2 = new Client({ name: provider.name, version: "1.0.0" }, opts);
  c2.setRequestHandler("elicitation/create", async () => ({ action: "accept", content: { confirm: true } }));
  transport = make();
  await c2.connect(transport);
  return { client: c2, transport, redirect };
}

// ── 1. Discovery ─────────────────────────────────────────────────
const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/api/mcp`)).json();
check("RFC 9728 protected resource metadata", prm.resource === mcpUrl.href && prm.authorization_servers?.[0] === base,
  JSON.stringify(prm));
const asm = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
check("RFC 8414 AS metadata: PKCE S256, iss param, CIMD, DCR",
  asm.code_challenge_methods_supported?.includes("S256") && asm.authorization_response_iss_parameter_supported === true &&
  asm.client_id_metadata_document_supported === true && !!asm.registration_endpoint);
const oidc = await (await fetch(`${base}/.well-known/openid-configuration`)).json();
check("OIDC discovery mirrors it", oidc.issuer === base && oidc.code_challenge_methods_supported?.includes("S256"));
const anon = await fetch(mcpUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("401 challenge names the starting scope", /scope="candidates:read"/.test(anon.headers.get("www-authenticate") ?? ""),
  anon.headers.get("www-authenticate"));

// ── 2. Full flow with Dynamic Client Registration (older clients) ──
const dcr = new TestProvider({ name: "e2e DCR client" });
const a = await connectWithOAuth(dcr);
check("DCR: registered, consented, code exchanged with PKCE, connected", !!a.client && /^dcr_/.test(dcr._info?.client_id ?? ""),
  dcr._info?.client_id);
check("authorization response carries iss (RFC 9207)", a.redirect?.searchParams.get("iss") === base);
const authParams = new URL(dcr.authUrls[0]).searchParams;
check("client sent resource + S256 challenge", authParams.get("resource") === mcpUrl.href && authParams.get("code_challenge_method") === "S256",
  `resource=${authParams.get("resource")} scope=${authParams.get("scope")}`);
const camps = await a.client.callTool({ name: "list_campaigns", arguments: {} });
check("OAuth token works on a read tool", Array.isArray(camps.structuredContent?.campaigns));

// Step-up: the token only has candidates:read; booking needs interviews:write.
const campaign = camps.structuredContent.campaigns.find((c) => c.title.startsWith("MCP test"));
const cands = (await a.client.callTool({ name: "search_candidates", arguments: { campaignId: campaign.id } })).structuredContent.candidates;
const slots = (await a.client.callTool({ name: "list_open_slots", arguments: { campaignId: campaign.id } })).structuredContent.slots;
const target = cands.find((c) => !c.scheduledAt);
let stepUpUrl;
try {
  await a.client.callTool({ name: "book_interview", arguments: { candidateId: target.id, slotId: slots[0].id } });
} catch (err) {
  stepUpUrl = dcr.authUrls.length > 1 ? dcr.authUrls.at(-1) : undefined;
  if (!stepUpUrl) check("insufficient_scope surfaced", /scope/i.test(String(err?.message)), err?.message);
}
if (stepUpUrl) {
  const scope = new URL(stepUpUrl).searchParams.get("scope") ?? "";
  check("step-up: re-authorization asks for interviews:write (and keeps candidates:read)",
    scope.includes("interviews:write") && scope.includes("candidates:read"), scope);
  const { redirect } = await browser(stepUpUrl);
  await a.transport.finishAuth(redirect.searchParams);
  const booked = await a.client.callTool({ name: "book_interview", arguments: { candidateId: target.id, slotId: slots[0].id } });
  check("after step-up the booking goes through (confirmed)", booked.structuredContent?.booked === true, JSON.stringify(booked.structuredContent));
} else {
  check("step-up authorization was triggered", false, "no second authorization URL");
}
await a.client.close();

// ── 3. Full flow with a Client ID Metadata Document (the MCP default) ──
const cimdServer = createServer((req, res) => {
  const id = `http://localhost:53681${req.url}`;
  const docs = {
    "/client.json": { client_id: id, client_name: "e2e CIMD client", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none",
                      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] },
    "/liar.json": { client_id: "http://localhost:53681/someone-else.json", client_name: "Liar", redirect_uris: [REDIRECT] },
  };
  const doc = docs[req.url];
  res.writeHead(doc ? 200 : 404, { "Content-Type": "application/json" });
  res.end(JSON.stringify(doc ?? {}));
}).listen(53681);
try {
  // The official client only accepts an https clientMetadataUrl (correct), so drive the CIMD flow by hand
  // against the dev escape hatch (MCP_OAUTH_ALLOW_LOCAL_CIMD) — exactly the requests a client would send.
  const cimdId = "http://localhost:53681/client.json";
  const v = randomBytes(32).toString("base64url");
  const ch = createHash("sha256").update(v).digest("base64url");
  const { redirect: cimdRedirect } = await browser(`${base}/api/oauth/authorize?` + new URLSearchParams({ response_type: "code",
    client_id: cimdId, redirect_uri: REDIRECT, code_challenge: ch, code_challenge_method: "S256", state: "c1", resource: mcpUrl.href,
    scope: "candidates:read" }));
  const cimdToken = await fetch(`${base}/api/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: cimdId, code: cimdRedirect?.searchParams.get("code") ?? "",
                                redirect_uri: REDIRECT, code_verifier: v, resource: mcpUrl.href }) }).then((r) => r.json());
  const cimdCall = cimdToken.access_token ? await fetch(mcpUrl, { method: "POST",
    headers: { Authorization: `Bearer ${cimdToken.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }) : null;
  check("CIMD: URL client_id → document fetched + validated → consent → token → MCP call",
    !!cimdToken.access_token && cimdCall?.status === 200, cimdToken.error_description ?? `mcp status ${cimdCall?.status}`);

  const liar = await fetch(`${base}/api/oauth/authorize?` + new URLSearchParams({ response_type: "code",
    client_id: "http://localhost:53681/liar.json", redirect_uri: REDIRECT, code_challenge: "x".repeat(43), code_challenge_method: "S256" }),
    { redirect: "manual" });
  check("CIMD whose client_id doesn't match its URL → refused, no redirect", liar.status === 400 && !liar.headers.get("location"),
    liar.status);
} finally {
  cimdServer.close();
}

// ── 4. Raw protocol attacks ──────────────────────────────────────
const reg = await (await fetch(`${base}/api/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_name: "raw", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", application_type: "native" }) })).json();
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const authorize = (extra = {}) => `${base}/api/oauth/authorize?` + new URLSearchParams({ response_type: "code", client_id: reg.client_id,
  redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s1", resource: mcpUrl.href,
  scope: "candidates:read offline_access", ...extra });
const token = (body) => fetch(`${base}/api/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: reg.client_id, resource: mcpUrl.href, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

const bad = await fetch(authorize({ redirect_uri: "https://evil.example/cb" }), { redirect: "manual" });
check("unregistered redirect_uri → error page, never redirected (open-redirect defence)", bad.status === 400 && !bad.headers.get("location"));
const noPkce = await fetch(authorize({ code_challenge_method: "plain" }), { redirect: "manual" });
check("non-S256 PKCE → error back to the client", new URL(noPkce.headers.get("location") ?? base).searchParams.get("error") === "invalid_request");

const denied = await browser(authorize(), "deny");
check("user denies → access_denied + state + iss", denied.redirect.searchParams.get("error") === "access_denied" &&
  denied.redirect.searchParams.get("state") === "s1" && denied.redirect.searchParams.get("iss") === base);

const ok1 = await browser(authorize());
const code = ok1.redirect.searchParams.get("code");
const wrongPkce = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: randomBytes(32).toString("base64url") });
check("wrong PKCE verifier → invalid_grant", wrongPkce.error === "invalid_grant", wrongPkce.error_description);
const reused = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier });
check("authorization code is single-use (2nd redemption refused)", reused.error === "invalid_grant", reused.error_description);

const ok2 = await browser(authorize());
const t1 = await token({ grant_type: "authorization_code", code: ok2.redirect.searchParams.get("code"), redirect_uri: REDIRECT, code_verifier: verifier });
check("code + PKCE → access + refresh token (offline_access)", !!t1.access_token && !!t1.refresh_token && t1.token_type === "Bearer",
  `scope=${t1.scope}`);
const t2 = await token({ grant_type: "refresh_token", refresh_token: t1.refresh_token });
check("refresh → new tokens, refresh token rotated", !!t2.access_token && t2.refresh_token && t2.refresh_token !== t1.refresh_token);
const replay = await token({ grant_type: "refresh_token", refresh_token: t1.refresh_token });
check("replaying the old refresh token → refused", replay.error === "invalid_grant", replay.error_description);
const afterTheft = await token({ grant_type: "refresh_token", refresh_token: t2.refresh_token });
check("…and the whole session is revoked (reuse = theft)", afterTheft.error === "invalid_grant", afterTheft.error_description);
const widen = await browser(authorize()).then((r) => token({ grant_type: "authorization_code", code: r.redirect.searchParams.get("code"),
  redirect_uri: REDIRECT, code_verifier: verifier })).then((t) => token({ grant_type: "refresh_token", refresh_token: t.refresh_token,
  scope: "candidates:read interviews:write offline_access" }));
check("refresh cannot widen scopes", widen.error === "invalid_scope", widen.error_description);

const wrongTarget = await token({ grant_type: "refresh_token", refresh_token: "x", resource: "https://other.example/mcp" });
check("token request for another resource → invalid_target", wrongTarget.error === "invalid_target");

const foreign = await new SignJWT({ scope: "candidates:read", client_id: "x" }).setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
  .setIssuer(base).setAudience("https://other-service.example/api").setSubject(args.user).setIssuedAt().setExpirationTime("5m")
  .sign(new TextEncoder().encode(process.env.MCP_TOKEN_SECRET));
const foreignRes = await fetch(mcpUrl, { method: "POST", headers: { Authorization: `Bearer ${foreign}`, "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
check("token issued for another audience → 401 (no token passthrough)", foreignRes.status === 401);

const accessViaQuery = await fetch(`${mcpUrl.href}?access_token=${t1.access_token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("token in the query string is ignored → 401", accessViaQuery.status === 401);

// ── 5. Connected apps: the user can see and disconnect a client ──
const conn = await browser(authorize()).then((r) => token({ grant_type: "authorization_code", code: r.redirect.searchParams.get("code"),
  redirect_uri: REDIRECT, code_verifier: verifier }));
const listed = await (await fetch(`${base}/api/oauth/connections`, { headers: { Cookie: sessionCookie } })).json();
const mine = listed.connections?.find((c) => c.clientId === reg.client_id);
check("connected app is listed for the user", !!mine, `${listed.connections?.length} connection(s)`);
await fetch(`${base}/api/oauth/connections?id=${mine?.id}`, { method: "DELETE", headers: { Cookie: sessionCookie } });
const afterDisconnect = await token({ grant_type: "refresh_token", refresh_token: conn.refresh_token });
check("after Disconnect the app can't refresh", afterDisconnect.error === "invalid_grant", afterDisconnect.error_description);

console.log(`\n${failures ? `${failures} failure(s)` : "All OAuth checks passed"}`);
process.exit(failures ? 1 : 0);
