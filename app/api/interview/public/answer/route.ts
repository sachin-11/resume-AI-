import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { FOLLOWUP_SYSTEM, followupPrompt } from "@/lib/prompts";
import { rateLimit, RATE_LIMITS, getIP, rateLimitResponse } from "@/lib/rate-limit";

// Public endpoint — no auth required (for candidate invite sessions)
export async function POST(req: NextRequest) {
  // Rate limit
  const rl = rateLimit(getIP(req), RATE_LIMITS.publicAnswer);
  if (!rl.success) return rateLimitResponse(rl);
  try {
    const { questionId, answerText, sessionId } = await req.json();

    if (!questionId || !answerText || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const session = await db.interviewSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const question = await db.question.findFirst({
      where: { id: questionId, sessionId },
    });
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    await db.answer.create({
      data: { questionId, text: answerText },
    });

    // Generate follow-up
    let followupQuestion = null;
    if (process.env.GROQ_API_KEY) {
      try {
        const followupText = await callGroq(
          FOLLOWUP_SYSTEM,
          followupPrompt(question.text, answerText)
        );
        if (followupText?.trim()) {
          const maxOrder = await db.question.aggregate({
            where: { sessionId },
            _max: { orderIndex: true },
          });
          followupQuestion = await db.question.create({
            data: {
              sessionId,
              text: followupText.trim(),
              type: "followup",
              orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
            },
          });
        }
      } catch {
        // follow-up is optional
      }
    }

    return NextResponse.json({ success: true, followupQuestion });
  } catch (err) {
    console.error("[PUBLIC_ANSWER]", err);
    return NextResponse.json({ error: "Failed to save answer" }, { status: 500 });
  }
}
