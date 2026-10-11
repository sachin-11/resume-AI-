#!/usr/bin/env node
/**
 * Contract test for the Resume-AI MCP server, using the official MCP client SDK.
 *
 *   node scripts/mcp-smoke.mjs --url http://localhost:3100/api/mcp --user <userId> [--other-user <id>]
 *
 * Covers: auth challenge (401 + WWW-Authenticate), modern (2026-07-28) and legacy (2025-era)
 * clients, tools/resources/prompts listing, structured tool results, pagination fields,
 * completion, prompts/get, resources/read, masked PII, per-tool scope challenge (403),
 * the human-confirmation round trip on book_interview (decline + accept), idempotent
 * re-booking, and cross-user isolation. Exits 1 on the first failed check.
 */
import { execFileSync } from "child_process";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { existsSync, readFileSync } from "fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const url = new URL(args.url ?? "http://localhost:3100/api/mcp");
if (!args.user) { console.error("--user <userId> is required"); process.exit(1); }

const token = (user, scopes) =>
  execFileSync("node", ["scripts/mcp-dev-token.mjs", "--user", user, "--scopes", scopes], { encoding: "utf8" }).trim();

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function connect(bearer, { mode = "auto", confirm = true } = {}) {
  const client = new Client(
    { name: "resume-ai-smoke", version: "1.0.0" },
    { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode } },
  );
  client.elicited = [];
  client.setRequestHandler("elicitation/create", async (req) => {
    client.elicited.push(req.params.message);
    return confirm ? { action: "accept", content: { confirm: true, message: "Smoke-test booking" } } : { action: "decline" };
  });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
  return client;
}

// 1. No token → 401 with the discovery challenge.
const anon = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
                                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
const challenge = anon.headers.get("www-authenticate") ?? "";
check("no token → 401 + WWW-Authenticate resource_metadata", anon.status === 401 && challenge.includes("resource_metadata"), challenge.slice(0, 120));

// Bad tokens are the client's problem (401 → refresh / re-authorize), never a 500.
const { SignJWT } = await import("jose");
const forged = await new SignJWT({ scope: "candidates:read" }).setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
  .setSubject(args.user).setExpirationTime("1h").sign(new TextEncoder().encode("not-the-server-secret-".repeat(3)));
for (const [label, bad] of [["malformed", "x.y.z"], ["not a JWT", "abc"], ["forged (wrong key)", forged]]) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${bad}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(`${label} token → 401 invalid_token`, r.status === 401 && (r.headers.get("www-authenticate") ?? "").includes("invalid_token"), `HTTP ${r.status}`);
}

// 2. Modern client, read-only scopes.
const full = token(args.user, "candidates:read screening:run interviews:write");
const reader = token(args.user, "candidates:read");
const c = await connect(full);
check("connect (version negotiation auto)", true, `server=${c.getServerVersion()?.name}`);

const tools = (await c.listTools()).tools;
const names = tools.map((t) => t.name);
check("tools/list has the 8 tools", ["list_campaigns", "search_candidates", "get_candidate", "list_open_slots", "screen_resume",
  "rank_candidates", "get_job_result", "book_interview"].every((n) => names.includes(n)), names.join(","));
const book = tools.find((t) => t.name === "book_interview");
check("annotations: book_interview destructive, list_campaigns read-only",
  book?.annotations?.destructiveHint === true && tools.find((t) => t.name === "list_campaigns")?.annotations?.readOnlyHint === true);
check("outputSchema advertised", !!tools.find((t) => t.name === "list_campaigns")?.outputSchema);

const templates = (await c.listResourceTemplates()).resourceTemplates.map((t) => t.uriTemplate);
check("resource templates", templates.includes("campaign://{campaignId}") && templates.includes("candidate://{candidateId}"), templates.join(","));
const prompts = (await c.listPrompts()).prompts.map((p) => p.name);
check("prompts/list", prompts.includes("review-campaign") && prompts.includes("interview-kit"), prompts.join(","));

const camps = await c.callTool({ name: "list_campaigns", arguments: {} });
const campaign = camps.structuredContent?.campaigns?.find((x) => x.title.startsWith("MCP test"));
check("list_campaigns → structuredContent", !!campaign, campaign ? `${campaign.title}: ${campaign.candidates} candidates, ${campaign.openSlots} slots` : JSON.stringify(camps).slice(0, 200));
if (!campaign) { console.log(`\n${failures} failure(s)`); process.exit(1); }

const found = await c.callTool({ name: "search_candidates", arguments: { campaignId: campaign.id, minScore: 60 } });
const cands = found.structuredContent?.candidates ?? [];
check("search_candidates: minScore filter + best first", cands.length === 2 && cands[0].overallScore >= cands[1].overallScore,
  cands.map((x) => `${x.name}:${x.overallScore}`).join(", "));
check("emails are masked", cands.every((x) => /^.\*\*\*@/.test(x.email)), cands[0]?.email);

const detail = await c.callTool({ name: "get_candidate", arguments: { candidateId: cands[0].id } });
check("get_candidate + resource_link", detail.structuredContent?.interview?.scores?.overall === cands[0].overallScore &&
  detail.content.some((b) => b.type === "resource_link"));

const res = await c.readResource({ uri: `campaign://${campaign.id}` });
check("resources/read campaign://", res.contents[0]?.text?.includes("Job description"));
const policy = await c.readResource({ uri: "resume-ai://policies/hiring" });
check("resources/read static policy", policy.contents[0]?.text?.includes("AI recommends, people decide"));

const completion = await c.complete({ ref: { type: "ref/prompt", name: "review-campaign" }, argument: { name: "campaign", value: "MCP" } });
check("completion/complete (per-user campaign titles)", completion.completion.values.some((v) => v.startsWith("MCP test")), completion.completion.values.join(" | "));
const kit = await c.getPrompt({ name: "interview-kit", arguments: { role: "Backend Engineer", level: "senior" } });
check("prompts/get", kit.messages[0]?.content?.text?.includes("senior Backend Engineer"));

const slots = (await c.callTool({ name: "list_open_slots", arguments: { campaignId: campaign.id } })).structuredContent?.slots ?? [];
check("list_open_slots", slots.length >= 2, `${slots.length} slots`);

// 3. Scope challenge: a read-only token may not book.
const r = await connect(reader);
let scopeErr = "";
try { await r.callTool({ name: "book_interview", arguments: { candidateId: cands[0].id, slotId: slots[0].id } }); }
catch (e) { scopeErr = String(e?.message ?? e); }
check("book_interview with read-only token → insufficient_scope", /insufficient_scope|403|scope/i.test(scopeErr), scopeErr.slice(0, 140));
await r.close();

// 4. Human confirmation round trip (modern client: input_required → elicitation → retry).
const declining = await connect(full, { confirm: false });
const declined = await declining.callTool({ name: "book_interview", arguments: { candidateId: cands[0].id, slotId: slots[0].id } });
check("decline → not booked", declined.structuredContent?.booked === false && declining.elicited.length === 1, declining.elicited[0]?.slice(0, 80));
await declining.close();

const accepted = await c.callTool({ name: "book_interview", arguments: { candidateId: cands[0].id, slotId: slots[0].id } });
check("accept → booked", accepted.structuredContent?.booked === true, JSON.stringify(accepted.structuredContent));
check("dry run: no email left the server", process.env.MCP_SEND_EMAILS !== "false" || accepted.structuredContent?.emailSent === false,
  accepted.structuredContent?.error);
const again = await c.callTool({ name: "book_interview", arguments: { candidateId: cands[0].id, slotId: slots[0].id } });
check("re-booking same slot is idempotent", again.structuredContent?.booked === true && /Already booked/.test(again.structuredContent?.error ?? ""));
await c.close();

// 5. Legacy (2025-era) client over stateless HTTP: it cannot receive server→client requests, so
//    book_interview hands back an approval link; the recruiter approves in the web app.
const legacy = await connect(full, { mode: "legacy" });
const legacyTools = (await legacy.listTools()).tools.length;
const pending = await legacy.callTool({ name: "book_interview", arguments: { candidateId: cands[1].id, slotId: slots[1].id } });
const approvalId = pending.structuredContent?.approvalId;
check("legacy client: approval link instead of a form", legacyTools === 8 && pending.structuredContent?.status === "pending_approval" &&
  /\/mcp\/approve\//.test(pending.structuredContent?.approvalUrl ?? ""), pending.structuredContent?.approvalUrl);
const samePending = await legacy.callTool({ name: "book_interview", arguments: { candidateId: cands[1].id, slotId: slots[1].id } });
check("asking again reuses the same pending approval", samePending.structuredContent?.approvalId === approvalId);

if (process.env.NEXTAUTH_SECRET && approvalId) {
  // The recruiter's browser: a NextAuth session cookie, then the Approve button.
  const { encode } = await import("next-auth/jwt");
  const session = await encode({ token: { sub: args.user, id: args.user, role: "recruiter" }, secret: process.env.NEXTAUTH_SECRET });
  const approve = await fetch(new URL(`/api/mcp/approvals/${approvalId}`, url), {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: `next-auth.session-token=${session}` },
    body: JSON.stringify({ decision: "approve" }),
  });
  const decided = await approve.json();
  check("recruiter approves in the web app → booked", approve.ok && decided.status === "approved" && decided.outcome?.booked === true,
    JSON.stringify(decided.outcome ?? decided).slice(0, 160));
  const after = await legacy.callTool({ name: "book_interview", arguments: { candidateId: cands[1].id, slotId: slots[1].id } });
  check("client asks again → already booked", after.structuredContent?.booked === true, after.structuredContent?.error);
}
await legacy.close();

// 6. Isolation: another user can't see these candidates.
if (args["other-user"]) {
  const other = await connect(token(args["other-user"], "candidates:read"));
  const peek = await other.callTool({ name: "get_candidate", arguments: { candidateId: cands[0].id } });
  check("other user → not found", peek.isError === true, peek.content?.[0]?.text);
  await other.close();
}

console.log(`\n${failures ? `${failures} failure(s)` : "All checks passed"}`);
process.exit(failures ? 1 : 0);
