/**
 * POST /api/oauth/revoke — RFC 7009 token revocation. Revoking a refresh token ends the
 * whole session (its rotation family). Access tokens are short-lived JWTs (1h) and simply
 * expire. Always 200, so the endpoint can't be used to probe which tokens exist.
 */
import { NextRequest } from "next/server";
import { revokeRefreshToken } from "@/lib/oauth/server";
import { corsPreflight, oauthJson, readForm } from "@/lib/oauth/http";

export async function POST(req: NextRequest) {
  const form = await readForm(req);
  const token = form.get("token");
  if (token && form.get("token_type_hint") !== "access_token") {
    await revokeRefreshToken(token, form.get("client_id") ?? undefined);
  }
  return oauthJson({});
}

export function OPTIONS() {
  return corsPreflight("POST, OPTIONS");
}
