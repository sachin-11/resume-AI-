import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { FEEDBACK_SYSTEM, feedbackPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import { FeedbackReport } from "@/types";
import { MOCK_FEEDBACK } from "@/lib/mockData";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await req.json();

    const interviewSession = await db.interviewSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
      include: {
        questions: {
          include: { answers: { orderBy: { createdAt: "asc" } } },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check if feedback already exists
    const existing = await db.feedbackReport.findUnique({
      where: { sessionId },
    });
    if (existing) {
      return NextResponse.json({ feedback: existing });
    }

    const qa = interviewSession.questions
      .filter((q) => q.answers.length > 0)
      .map((q) => ({
        question: q.text,
        answer: q.answers[0].text,
        candidateAnswer: q.answers[0].text,
      }));

    let feedback: FeedbackReport;

    if (!process.env.GROQ_API_KEY || qa.length === 0) {
      feedback = MOCK_FEEDBACK;
    } else {
      const raw = await callGroq(FEEDBACK_SYSTEM, feedbackPrompt(qa));
      feedback = safeJsonParse<FeedbackReport>(raw, MOCK_FEEDBACK);
    }

    const report = await db.feedbackReport.create({
      data: {
        sessionId,
        overallScore: feedback.overallScore,
        technicalScore: feedback.technicalScore,
        communicationScore: feedback.communicationScore,
        confidenceScore: feedback.confidenceScore,
        strengths: feedback.strengths,
        weakAreas: feedback.weakAreas,
        betterAnswers: feedback.betterAnswers as object[],
        improvementRoadmap: feedback.improvementRoadmap,
        summary: feedback.summary,
      },
    });

    await db.interviewSession.update({
      where: { id: sessionId },
      data: { status: "completed" },
    });

    return NextResponse.json({ feedback: report });
  } catch (err) {
    console.error("[FEEDBACK_GENERATE]", err);
    return NextResponse.json({ error: "Failed to generate feedback" }, { status: 500 });
  }
}
