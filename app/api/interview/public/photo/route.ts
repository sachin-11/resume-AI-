import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, RATE_LIMITS, getIP, rateLimitResponse } from "@/lib/rate-limit";
import { verifyInviteToken } from "@/lib/candidateInvite";

// Public endpoint — saves candidate photo snapshot (base64) against their invite token
export async function POST(req: NextRequest) {
  const rl = rateLimit(getIP(req), RATE_LIMITS.publicPhoto);
  if (!rl.success) return rateLimitResponse(rl);
  try {
    const { sessionId, token, photoDataUrl } = await req.json();

    if (!sessionId || !photoDataUrl) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Validate it's a real base64 image (max ~500KB)
    if (!photoDataUrl.startsWith("data:image/") || photoDataUrl.length > 700_000) {
      return NextResponse.json({ error: "Invalid photo" }, { status: 400 });
    }

    if (!(await verifyInviteToken(sessionId, token))) {
      return NextResponse.json({ error: "Invalid or missing invite token" }, { status: 403 });
    }

    await db.candidateInvite.updateMany({
      where: { token, sessionId },
      data: { photoUrl: photoDataUrl },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[CANDIDATE_PHOTO]", err);
    return NextResponse.json({ error: "Failed to save photo" }, { status: 500 });
  }
}
