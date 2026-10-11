/**
 * GET /api/oauth/authorize — OAuth 2.1 authorization endpoint (code flow, PKCE S256).
 *
 * Until client_id and redirect_uri are verified, errors are shown here and NOT redirected
 * (otherwise this endpoint is an open redirector). After that, errors go back to the
 * client's redirect_uri with error + state + iss. A valid request becomes a signed,
 * 10-minute pending request and the user is sent to the consent screen (which needs login).
 */
import { NextRequest, NextResponse } from "next/server";
import { OAuthClientError, assertRedirectUri, resolveClient } from "@/lib/oauth/clients";
import { OAuthError, authorizationResponseUrl, canonicalResource, parseScopes, signPending } from "@/lib/oauth/server";
import { checkRateLimit, getIP } from "@/lib/rate-limit";
import { appBaseUrl } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";

function errorPage(message: string, status = 400): Response {
  const safe = message.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Authorization error</title>` +
    `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
    `<h1 style="font-size:1.25rem">This app can't connect to Resume AI</h1><p>${safe}</p>` +
    `<p style="color:#666">Return to the app and try again, or contact its developer.</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(req: NextRequest) {
  const limited = checkRateLimit(`oauth-authorize:${getIP(req)}`, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const q = req.nextUrl.searchParams;
  let client;
  let redirectUri;
  try {
    client = await resolveClient(q.get("client_id"));
    redirectUri = assertRedirectUri(client, q.get("redirect_uri"));
  } catch (err) {
    if (err instanceof OAuthClientError) return errorPage(err.message);
    throw err;
  }

  const state = q.get("state") ?? undefined;
  const back = (error: string, description: string) =>
    NextResponse.redirect(authorizationResponseUrl({ redirectUri, state }, { error, error_description: description }));

  if (q.get("response_type") !== "code") return back("unsupported_response_type", "Only response_type=code is supported");
  const challenge = q.get("code_challenge");
  if (!challenge || q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }

  try {
    const resource = canonicalResource(q.get("resource"));
    const { scopes, offline } = parseScopes(q.get("scope"));
    const pending = await signPending({
      clientId: client.id, clientName: client.name, clientKind: client.kind, redirectUri, state,
      scopes, offline, codeChallenge: challenge, resource,
    });
    // The public base URL, not req.nextUrl.origin: behind Amplify's proxy the request URL is the
    // internal http://localhost:3000, which would send the recruiter's browser nowhere.
    const consent = new URL("/oauth/consent", appBaseUrl());
    consent.searchParams.set("request", pending);
    return NextResponse.redirect(consent);
  } catch (err) {
    if (err instanceof OAuthError) return back(err.code, err.message);
    throw err;
  }
}
