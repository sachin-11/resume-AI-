/**
 * POST /api/oauth/token — authorization_code (with PKCE) and refresh_token grants.
 * Public clients only (token_endpoint_auth_method=none): the client is identified by
 * client_id and proven by the PKCE verifier / refresh-token possession.
 */
import { NextRequest } from "next/server";
import { OAuthClientError, resolveClient } from "@/lib/oauth/clients";
import { OAuthError, canonicalResource, exchangeCode, refresh } from "@/lib/oauth/server";
import { corsPreflight, oauthErrorResponse, oauthJson, readForm } from "@/lib/oauth/http";
import { checkRateLimit, getIP } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(`oauth-token:${getIP(req)}`, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const form = await readForm(req);
  const grant = form.get("grant_type");
  try {
    const clientId = form.get("client_id") ?? "";
    const client = await resolveClient(clientId).catch((err) => {
      if (err instanceof OAuthClientError) throw new OAuthError("invalid_client", err.message, 401);
      throw err;
    });
    const resource = canonicalResource(form.get("resource"));

    if (grant === "authorization_code") {
      const body = await exchangeCode({
        code: form.get("code") ?? "", codeVerifier: form.get("code_verifier") ?? "", clientId: client.id,
        redirectUri: form.get("redirect_uri") ?? "", resource, clientName: client.name,
      });
      return oauthJson(body);
    }
    if (grant === "refresh_token") {
      const body = await refresh({ refreshToken: form.get("refresh_token") ?? "", clientId: client.id, resource,
                                   scope: form.get("scope") ?? undefined });
      return oauthJson(body);
    }
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export function OPTIONS() {
  return corsPreflight("POST, OPTIONS");
}
