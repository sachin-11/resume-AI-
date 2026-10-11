/**
 * POST /api/oauth/consent — the signed-in recruiter's answer on the consent screen.
 * Body: { request: <signed pending request>, decision: "allow" | "deny" }
 * Returns { redirect } — the client's redirect_uri with code (or error) + state + iss.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { OAuthError, authorizationResponseUrl, issueCode, verifyPending } from "@/lib/oauth/server";

const Body = z.object({ request: z.string().min(10), decision: z.enum(["allow", "deny"]) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (session.user.role === "candidate") {
    return NextResponse.json({ error: "Only recruiter accounts can connect AI assistants" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const pending = await verifyPending(parsed.data.request);
    if (parsed.data.decision === "deny") {
      return NextResponse.json({ redirect: authorizationResponseUrl(pending, { error: "access_denied",
                                                                              error_description: "The user declined" }) });
    }
    const code = await issueCode(session.user.id, pending);
    console.info(JSON.stringify({ event: "oauth_consent", user_id: session.user.id, client_id: pending.clientId,
                                  scopes: pending.scopes, offline: pending.offline, at: new Date().toISOString() }));
    return NextResponse.json({ redirect: authorizationResponseUrl(pending, { code }) });
  } catch (err) {
    if (err instanceof OAuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
