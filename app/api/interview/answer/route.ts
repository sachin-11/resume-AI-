import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeAnswerAndMaybeFollowup } from "@/lib/interview-answer-analysis";
import { runAdaptiveCheckpoint } from "@/lib/interview-adaptive-checkpoint";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { questionId, answerText, sessionId } = await req.json();

    if (!questionId || !answerText || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify ownership + fetch question in parallel
    const [interviewSession, question] = await Promise.all([
      db.interviewSession.findFirst({ where: { id: sessionId, userId: session.user.id } }),
      db.question.findFirst({ where: { id: questionId, sessionId } }),
    ]);

    if (!interviewSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });

    const hasLlm = Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);

    const [createdAnswer, { confidence, followupText }] = await Promise.all([
      db.answer.create({ data: { questionId, text: answerText } }),
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
    }

    let adaptive: Awaited<ReturnType<typeof runAdaptiveCheckpoint>> = { applied: false };
    try {
      adaptive = await runAdaptiveCheckpoint({
        sessionId,
        userId: session.user.id,
        hasLlm,
      });
    } catch (err) {
      console.error("[ADAPTIVE_CHECKPOINT]", err);
    }

    return NextResponse.json({ success: true, followupQuestion, confidence, adaptive });
  } catch (err) {
    console.error("[INTERVIEW_ANSWER]", err);
    return NextResponse.json({ error: "Failed to save answer" }, { status: 500 });
  }
}
