import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getIP, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t")?.trim() ?? "";
  if (token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const ip = getIP(req);
  const rl = rateLimit(`copilot-poll:${ip}:${token.slice(0, 8)}`, { limit: 50, windowMs: 60_000 });
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  const s = await db.copilotLinkSession.findUnique({ where: { joinToken: token } });
  if (!s) {
    return NextResponse.json({ ok: false, notFound: true });
  }
  if (s.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, expired: true, expiresAt: s.expiresAt.toISOString() });
  }

  return NextResponse.json({
    ok: true,
    seq: s.lastSeq,
    text: s.lastTranscript,
    lastQuestion: s.lastQuestion,
    lastAnswer: s.lastAnswer,
    updatedAt: s.updatedAt.toISOString(),
  });
}
