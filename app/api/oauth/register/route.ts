/**
 * POST /api/oauth/register — RFC 7591 Dynamic Client Registration.
 * Deprecated by MCP 2026-07-28 in favour of Client ID Metadata Documents; kept so older
 * MCP clients that only know DCR can still connect. Public clients only, strict redirect URIs,
 * rate-limited (registration is unauthenticated by design).
 */
import { NextRequest } from "next/server";
import { registerClient } from "@/lib/oauth/server";
import { corsPreflight, oauthErrorResponse, oauthJson } from "@/lib/oauth/http";
import { checkRateLimit, getIP } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(`oauth-register:${getIP(req)}`, { limit: 10, windowMs: 60 * 60_000 });
  if (limited) return limited;
  try {
    const meta = await req.json().catch(() => ({}));
    return oauthJson(await registerClient(meta), 201);
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export function OPTIONS() {
  return corsPreflight("POST, OPTIONS");
}
