import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeAnswerAndMaybeFollowup } from "@/lib/interview-answer-analysis";
import { runAdaptiveCheckpoint } from "@/lib/interview-adaptive-checkpoint";
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
      select: { id: true, userId: true },
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

    const hasLlm = Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);

    const [createdAnswer, { confidence, followupText }] = await Promise.all([
      db.answer.create({
        data: { questionId, text: answerText },
      }),
      analyzeAnswerAndMaybeFollowup(question.text, answerText, hasLlm),
    ]);

    await db.answer.update({
      where: { id: createdAnswer.id },
      data: {
        qualityScore: confidence.qualityScore,
        confidenceScore: confidence.confidenceScore,
      },
    });

    let followupQuestion = null;
    if (followupText) {
      try {
        const maxOrder = await db.question.aggregate({
          where: { sessionId },
          _max: { orderIndex: true },
        });
        followupQuestion = await db.question.create({
          data: {
            sessionId,
            text: followupText,
            type: "followup",
            orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
          },
        });
      } catch {
        // follow-up is optional
      }
    }

    let adaptive: Awaited<ReturnType<typeof runAdaptiveCheckpoint>> = { applied: false };
    try {
      adaptive = await runAdaptiveCheckpoint({
        sessionId,
        userId: session.userId,
        hasLlm,
      });
    } catch (err) {
      console.error("[PUBLIC_ADAPTIVE_CHECKPOINT]", err);
    }

    return NextResponse.json({ success: true, followupQuestion, confidence, adaptive });
  } catch (err) {
    console.error("[PUBLIC_ANSWER]", err);
    return NextResponse.json({ error: "Failed to save answer" }, { status: 500 });
  }
}
