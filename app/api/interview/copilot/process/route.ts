import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processCopilotTranscript } from "@/lib/copilot";
import { stripHtml } from "@/lib/utils";
import { getIP, rateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = `copilot:${session.user.id}:${getIP(req)}`;
  const rl = rateLimit(id, { limit: 15, windowMs: 60_000 });
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  let body: { text?: string; direct?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = stripHtml((body.text ?? "").trim()).slice(0, 5000);
  if (text.length < 8) {
    return NextResponse.json({ error: "Text too short" }, { status: 400 });
  }

  // Default direct=true: turant answer (koi alag "generate" step nahi)
  const direct = body.direct !== false;

  try {
    const result = await processCopilotTranscript(session.user.id, text, { direct });
    if (result.action === "skip") {
      return NextResponse.json({ action: "skip", reason: result.reason });
    }
    return NextResponse.json({
      action: "answer",
      question: result.question,
      answer: result.answer,
    });
  } catch (err) {
    console.error("[COPILOT]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 }
    );
  }
}
