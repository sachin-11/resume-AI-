import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processCopilotTranscript } from "@/lib/copilot";
import { stripHtml } from "@/lib/utils";
import { getIP, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  const rl = rateLimit(`copilot-answer:${ip}`, { limit: 12, windowMs: 60_000 });
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  let body: { token?: string; text?: string; useLatest?: boolean; direct?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  if (token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const s = await db.copilotLinkSession.findUnique({ where: { joinToken: token } });
  if (!s) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (s.expiresAt < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const useLatest = body.useLatest === true;
  const raw = useLatest ? s.lastTranscript : (body.text ?? "");
  const text = stripHtml(String(raw).trim()).slice(0, 5000);
  if (text.length < 8) {
    return NextResponse.json({ error: "Text too short (min 8 characters)" }, { status: 400 });
  }

  const direct = body.direct !== false;

  try {
    const result = await processCopilotTranscript(s.userId, text, { direct });
    if (result.action === "skip") {
      return NextResponse.json({ action: "skip", reason: result.reason });
    }

    const q = result.question;
    const a = result.answer;
    await db.copilotLinkSession.update({
      where: { id: s.id },
      data: { lastQuestion: q, lastAnswer: a },
    });

    return NextResponse.json({ action: "answer", question: q, answer: a });
  } catch (err) {
    console.error("[COPILOT-LINK-ANSWER]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 }
    );
  }
}
