import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { FOLLOWUP_SYSTEM, followupPrompt } from "@/lib/prompts";

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

    // Save answer + generate followup in parallel
    const [, followupText] = await Promise.all([
      db.answer.create({ data: { questionId, text: answerText } }),
      process.env.GROQ_API_KEY
        ? callGroq(FOLLOWUP_SYSTEM, followupPrompt(question.text, answerText))
            .then((t) => t.trim())
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    // Save follow-up as a new question if generated
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

    return NextResponse.json({ success: true, followupQuestion });
  } catch (err) {
    console.error("[INTERVIEW_ANSWER]", err);
    return NextResponse.json({ error: "Failed to save answer" }, { status: 500 });
  }
}
