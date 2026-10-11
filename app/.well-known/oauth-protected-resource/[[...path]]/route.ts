/**
 * RFC 9728 Protected Resource Metadata for the MCP endpoint — the first thing an MCP
 * client fetches after a 401 (its URL is in WWW-Authenticate: resource_metadata=…).
 * Served at /.well-known/oauth-protected-resource/api/mcp (path-aware) and at the bare path.
 *
 * scopes_supported is the minimal set for basic use (per MCP); more scopes are requested
 * on demand through insufficient_scope challenges. offline_access is deliberately not
 * listed here — refresh tokens are not a resource requirement.
 */
import { mcpResourceUrl } from "@/lib/mcp/auth";
import { issuer } from "@/lib/oauth/server";
import { corsPreflight, jsonCors } from "@/lib/oauth/http";

export function GET() {
  const resource = mcpResourceUrl().href;
  return jsonCors({
    resource,
    authorization_servers: [issuer()],
    scopes_supported: ["candidates:read"],
    bearer_methods_supported: ["header"],
    resource_name: "Resume AI — Recruiting",
    resource_documentation: `${issuer()}/mcp`,
  });
}

export function OPTIONS() {
  return corsPreflight("GET, OPTIONS");
}
