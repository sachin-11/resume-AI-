/**
 * Resume-AI MCP server — Streamable HTTP endpoint (MCP 2026-07-28, stateless;
 * 2025-era clients are served by the SDK's stateless legacy fallback).
 *
 * Every request goes through, in order:
 *   1. Origin check — browsers may only call from our own origin (DNS-rebinding defence);
 *      native MCP clients send no Origin header and pass.
 *   2. Rate limit — per client IP, before any work.
 *   3. Bearer token — OAuth 2.1 access token for THIS resource (audience-checked).
 *      A missing/invalid token gets 401 + `WWW-Authenticate: Bearer resource_metadata=…`,
 *      which is how an MCP client discovers our Authorization Server.
 *   4. The MCP handler, with the verified AuthInfo; per-tool scopes are enforced
 *      there (403 insufficient_scope → the client asks the user for just that scope).
 */
import {
  createMcpHandler, getOAuthProtectedResourceMetadataUrl, originValidationResponse, requireBearerAuth,
} from "@modelcontextprotocol/server";
import { buildMcpServer } from "@/lib/mcp/server";
import { mcpResourceUrl, tokenVerifier } from "@/lib/mcp/auth";
import { checkRateLimit, getIP } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler((ctx) => buildMcpServer(ctx), {
  legacy: "stateless",
  responseMode: "auto",   // JSON unless a tool streams progress, then SSE
  onerror: (err) => console.error(JSON.stringify({ event: "mcp_error", message: err.message })),
});

function allowedOrigins(): string[] {
  const host = mcpResourceUrl().hostname;
  return [host, "localhost", "127.0.0.1"];
}

async function serve(request: Request): Promise<Response> {
  const badOrigin = originValidationResponse(request, allowedOrigins());
  if (badOrigin) return badOrigin;

  const limited = checkRateLimit(`mcp:${getIP(request)}`, { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const gate = requireBearerAuth({
    verifier: tokenVerifier,
    expectedResource: mcpResourceUrl(),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpResourceUrl()),
  });
  const auth = await gate(request);
  if (auth instanceof Response) return auth;

  return handler.fetch(request, { authInfo: auth });
}

export { serve as POST, serve as GET, serve as DELETE };
