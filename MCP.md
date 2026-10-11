# Resume-AI and MCP

Resume-AI uses the Model Context Protocol (spec **2026-07-28**) on both sides:

- **Server.** The Next.js app exposes recruiter data and actions at `/api/mcp`, so any MCP host (Claude Desktop, Claude Code, MCP Inspector, …) can work with a recruiter's campaigns after the recruiter allows it through OAuth.
- **Client.** The Python agent-service *consumes* MCP servers (GitHub, Brave Search, Google Calendar, and our own server) through the official Python SDK.

```
 Claude Desktop / Claude Code / Inspector                 agent-service (Python, Render)
            │  OAuth 2.1 (PKCE) → access token                    │ core/mcp_pool.py (mcp==2.3.0)
            ▼                                                     ├──► GitHub hosted MCP (/readonly, HTTP)
 Next.js /api/mcp  ── Streamable HTTP, stateless ──               ├──► Brave Search MCP (stdio, pinned)
   origin check → rate limit → bearer auth (aud = /api/mcp)       ├──► Calendar MCP (stdio)
   → tool scope check → tool → audit line (trace_id)              └──► Resume-AI /api/mcp (read-only tools)
            │
            ├── Postgres (Prisma): campaigns, candidates, slots, approvals, OAuth clients/codes/tokens
            └── agent-service /jobs (fresh service JWT, never the user's token)
```

## What the server offers

| Kind | Name | Scope | Notes |
|---|---|---|---|
| tool | `list_campaigns` | `candidates:read` | paginated (`cursor`) |
| tool | `search_candidates` | `candidates:read` | filters, best score first, emails masked |
| tool | `get_candidate` | `candidates:read` | returns a `resource_link` to `candidate://…` |
| tool | `list_open_slots` | `candidates:read` | |
| tool | `screen_resume` | `screening:run` | runs the screening agent; progress notifications |
| tool | `rank_candidates` | `screening:run` | long job → returns a `jobHandle` |
| tool | `get_job_result` | `screening:run` | polls a job, waits ≤ ~20 s |
| tool | `book_interview` | `interviews:write` | **always asks the human first** (see below), idempotent |
| resource | `campaign://{campaignId}`, `candidate://{candidateId}`, `resume-ai://policies/hiring` | | templates with completion |
| prompt | `review-campaign`, `interview-kit` | | arguments are auto-completed |

All tools carry annotations (`readOnlyHint`, `destructiveHint`, …) and an `outputSchema` (structured results).

**Human confirmation on `book_interview`.** It sends email and books a real slot, so the server never acts on the model's word alone. The confirmation method depends on the client:
- **Form elicitation** (MRTR `input_required`): the client shows a confirm form.
- **URL elicitation:** the user opens our approval page.
- **Approval link:** for 2025-era clients that can't receive server→client requests over stateless HTTP. The recruiter approves at `/mcp/approve/{id}` in the web app.

## Connecting a client

The production endpoint is `https://resume-ai-coach.rasuonline.in/api/mcp`. A client finds everything else from the 401 challenge (RFC 9728 → RFC 8414).

- **Claude Code:** `claude mcp add --transport http resume-ai https://resume-ai-coach.rasuonline.in/api/mcp`, then run `/mcp` to sign in.
- **Claude Desktop:** Settings → Connectors → *Add custom connector* → paste the URL → Connect.
- **MCP Inspector:** `npx @modelcontextprotocol/inspector` → transport *Streamable HTTP* → URL → *Open Auth Settings* → *Quick OAuth Flow*.

Sign-in happens in the browser:
1. Log in to Resume-AI.
2. Read the consent screen: which app, where it redirects, and which scopes.
3. Click **Allow**.

Recruiters can see every connected app and disconnect it at **Settings → Connected AI apps**.

## Auth: our own OAuth 2.1 Authorization Server

| Piece | Where | Standard |
|---|---|---|
| Protected resource metadata | `/.well-known/oauth-protected-resource/api/mcp` | RFC 9728 |
| AS metadata | `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` | RFC 8414 / OIDC discovery |
| Authorize + consent | `/api/oauth/authorize` → `/oauth/consent` | OAuth 2.1, PKCE **S256 only**, `iss` in response (RFC 9207) |
| Token | `/api/oauth/token` | auth code (single use, 60 s), refresh **rotation**; reuse revokes the whole family |
| Client registration | Client ID Metadata Documents (https URL as `client_id`, fetched behind an SSRF fence); DCR at `/api/oauth/register` | CIMD (preferred); RFC 7591 (deprecated, kept for older clients) |
| Revocation | `/api/oauth/revoke` | RFC 7009 |

Access tokens are 1-hour HS256 JWTs (`typ: at+jwt`). Their audience is exactly `…/api/mcp` (RFC 8707 `resource`), so a token issued for anything else is rejected.

Scopes are requested incrementally. A client starts with `candidates:read`. A tool that needs more returns `403 insufficient_scope`, and the client asks the user again.

## The agent-service as an MCP client (`agent-service/core/mcp_pool.py`)

- The pool uses the official SDK (`mcp==2.3.0`) and keeps one long-lived session per server. A background task owns each session, and a dead or hung session is restarted.
- Transports:
  - **Streamable HTTP:** GitHub's hosted server (`/readonly` endpoint) and our own server.
  - **stdio:** local servers, started from **exact versions** (`@brave/brave-search-mcp-server@2.1.4`), never "latest".
- **Allowlist per server:** checked before any session opens (e.g. GitHub: only `search_repositories`).
- **Tool pinning (rug-pull / tool-poisoning defence):**
  - Each allowlisted tool's definition is hashed and compared with `agent-service/mcp_pins.json`.
  - A changed description is refused and fires an alert.
  - `python -m core.mcp_pool pin` prints the current hashes to review and commit.
- **No token passthrough.** When `/api/mcp` calls the agent-service, it mints a fresh service JWT. When the agent-service calls our server, it uses its own token with read-only tools.

## Observability

- **Audit lines.** Every tool call logs one JSON line, `mcp_tool_call`: user, OAuth client, tool, argument *names* + SHA-256 (no raw candidate data), ok, ms.
- **Tracing (SEP-414).** Clients may send W3C trace context in `_meta.traceparent`.
  - The agent-service always sends it, with the trace id derived from its request id, and logs `mcp_call trace_id=…`.
  - The server's audit line logs the same `trace_id`, so one search finds both sides of a call.

## Tests

| What | Command | In CI |
|---|---|---|
| Server contract: 26 checks (modern + legacy clients, scopes, confirmation round trip, idempotency, isolation) | `node scripts/mcp-smoke.mjs --user <id> --other-user <id>` | `mcp-e2e` job |
| OAuth end to end: 27 checks (discovery, DCR, CIMD, PKCE, consent, refresh rotation + reuse detection, revocation, disconnect) | `node scripts/mcp-oauth-e2e.mjs --user <id>` | `mcp-e2e` job |
| Tool definitions unchanged vs. eval snapshot | `node scripts/mcp-tools-snapshot.mjs --user <id> --check` | `mcp-e2e` job |
| Tool selection: does an LLM pick the right tool + args from our descriptions? | `python -m evals.run_evals --suite mcp_tools` | eval gate |
| Python client pool: in-memory server, allowlist, errors, pinning, tracing | `pytest tests/test_mcp_pool.py` | `agent-tests` |

To run the tests locally:
1. Run `node scripts/mcp-seed.mjs`. It seeds a localhost database only and prints the user ids.
2. Start the app with `npm run dev -- -p 3100`.
3. Run the commands in the table above.

`MCP_SEND_EMAILS=false` keeps test bookings from emailing anyone.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `MCP_TOKEN_SECRET` | web | signs MCP access tokens (≥ 32 random bytes) |
| `MCP_STATE_SECRET` | web | HMAC for MRTR `requestState` |
| `MCP_PUBLIC_URL` | web | public base URL (issuer / audience); falls back to `NEXTAUTH_URL`. **Must be the same domain as `NEXTAUTH_URL`**: the consent screen needs the login cookie, which lives on that domain |
| `MCP_SEND_EMAILS` | web | `false` = dry run, no interview emails |
| `MCP_OAUTH_ALLOW_LOCAL_CIMD` | web, dev only | lets a localhost URL be a CIMD client id (ignored in production) |
| `GITHUB_PERSONAL_ACCESS_TOKEN`, `BRAVE_API_KEY`, `GOOGLE_CALENDAR_MCP_*` | agent-service | enable those MCP servers |
| `RESUME_AI_MCP_URL`, `RESUME_AI_MCP_TOKEN` | agent-service | optional: our own server as a source |

## Runbook

- **Suspicious client:** the user disconnects it under *Connected AI apps*, which revokes the refresh family. Already-issued access tokens expire within one hour. To cut every client off at once:
  1. Revoke all refresh tokens: `UPDATE "OAuthRefreshToken" SET "revokedAt" = now() WHERE "revokedAt" IS NULL`.
  2. Rotate `MCP_TOKEN_SECRET`, so all access tokens die immediately.

  Rotating the secret alone is not enough: a client would just refresh and get a new token.
- **`mcp_tool_definition_changed` alert:**
  1. Diff the upstream tool's description and schema.
  2. If it's benign, re-run `python -m core.mcp_pool pin` and commit `mcp_pins.json`.
  3. Until then, that tool stays refused, and the agent falls back where it can.
- **Rate limit:** 120 requests per minute per IP on `/api/mcp`. Raise it in `app/api/mcp/route.ts` if a legitimate host trips it.
- **Registry:** `server.json` describes the remote server for the MCP Registry. Publish it with `mcp-publisher login github && mcp-publisher publish`.

## Deprecated or left out, and why

| Feature | Status in 2026-07-28 | What we do instead |
|---|---|---|
| HTTP+SSE transport | removed (since 2025-03-26) | Streamable HTTP |
| `initialize` handshake / sessions | stateless now | `server/discover` + per-request `_meta`; any instance can serve any request |
| Sampling (server asks the client's LLM) | deprecated | the server runs its own agents (agent-service) |
| Roots | deprecated | not needed: our server doesn't touch client files |
| Logging (`notifications/message`) | deprecated | structured audit lines + OTel trace ids |
| Dynamic Client Registration | deprecated in favour of CIMD | CIMD first; DCR kept for older clients |
| Token passthrough | forbidden by the spec | fresh service JWT per downstream call |
| `npx -y <pkg>` (unpinned) | — (supply chain) | exact versions + tool pinning |

**Next phases.**
- Phase 5: `subscriptions/listen` for live candidate updates, and the tasks extension for long jobs. This would replace the `jobHandle` polling.
- Phase 7: per-client rate limits, and anomaly alerts on audit lines.
