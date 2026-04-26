import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { newJoinToken, publicJoinBaseFromRequest, displayCodeFromToken } from "@/lib/copilot-link";
import { getIP, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const DEFAULT_TTL_H = 2;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = `copilot-link-create:${session.user.id}:${getIP(req)}`;
  const rl = rateLimit(id, { limit: 8, windowMs: 60_000 });
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  let ttlH = DEFAULT_TTL_H;
  try {
    const b = await req.json();
    if (typeof b?.ttlHours === "number" && b.ttlHours >= 0.5 && b.ttlHours <= 6) {
      ttlH = b.ttlHours;
    }
  } catch {
    /* default */
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      {
        error:
          "Is database se aapka account match nahi ho raha (session purana DB / naya DB). Log out karke phir login karo, ya .env aur .env.local mein same DATABASE_URL rakho jahan user bana hai.",
        code: "USER_NOT_IN_DB",
      },
      { status: 403 }
    );
  }

  const joinToken = newJoinToken();
  const expiresAt = new Date(Date.now() + ttlH * 60 * 60 * 1000);
  const row = await db.copilotLinkSession.create({
    data: { userId: session.user.id, joinToken, expiresAt },
  });

  const base = publicJoinBaseFromRequest(req);
  const joinUrl = `${base}/interview/phone?t=${encodeURIComponent(joinToken)}`;
  return NextResponse.json({
    sessionId: row.id,
    joinToken, // for client; store only sessionId+token in state
    code: displayCodeFromToken(joinToken),
    joinUrl,
    expiresAt: expiresAt.toISOString(),
  });
}
