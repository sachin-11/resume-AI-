/** Small HTTP helpers shared by the OAuth endpoints. */
import { OAuthError } from "@/lib/oauth/server";

/** Discovery documents are public and read by browser-based clients too. */
export function jsonCors(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export function corsPreflight(methods = "GET, POST, OPTIONS"): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** OAuth error / token responses: JSON, never cached (RFC 6749 §5.1). */
export function oauthJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache", "Access-Control-Allow-Origin": "*" },
  });
}

export function oauthErrorResponse(err: unknown): Response {
  if (err instanceof OAuthError) return oauthJson({ error: err.code, error_description: err.message }, err.status);
  console.error(JSON.stringify({ event: "oauth_error", message: err instanceof Error ? err.message : String(err) }));
  return oauthJson({ error: "server_error", error_description: "Unexpected error" }, 500);
}

/** Token / revoke endpoints take application/x-www-form-urlencoded (accept JSON too, leniently). */
export async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}
