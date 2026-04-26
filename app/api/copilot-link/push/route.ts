import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripHtml } from "@/lib/utils";
import { getIP, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX = 12_000;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = `copilot-link-push:${session.user.id}:${getIP(req)}`;
  const rl = rateLimit(id, { limit: 90, windowMs: 60_000 });
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  let body: { sessionId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = (body.sessionId ?? "").trim();
  const text = stripHtml((body.text ?? "").trim()).slice(0, MAX);
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const s = await db.copilotLinkSession.findFirst({
    where: { id: sessionId, userId: session.user.id },
  });
  if (!s) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (s.expiresAt < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  if (s.lastTranscript === text) {
    return NextResponse.json({ ok: true, seq: s.lastSeq, skipped: true });
  }

  const updated = await db.copilotLinkSession.update({
    where: { id: sessionId },
    data: { lastTranscript: text, lastSeq: { increment: 1 } },
  });
  return NextResponse.json({ ok: true, seq: updated.lastSeq });
}
