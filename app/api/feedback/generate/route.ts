import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { FEEDBACK_SYSTEM, feedbackPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import { FeedbackReport } from "@/types";
import { MOCK_FEEDBACK } from "@/lib/mockData";
import { buildFeedbackRAGContext } from "@/lib/rag";

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

    // Skipped/meaningless answers filter karo
    const SKIP_PATTERNS = /^\[skipped\]$|^(no|yes|ok|okay|skip|idk|na|n\/a|\.+|-+)$/i;
    const MIN_ANSWER_WORDS = 3;

    const qa = interviewSession.questions
      .filter((q) => q.answers.length > 0)
      .map((q) => ({
        question: q.text,
        answer: q.answers[0].text,
        candidateAnswer: q.answers[0].text,
        skipped: SKIP_PATTERNS.test(q.answers[0].text.trim()) ||
                 q.answers[0].text.trim().split(/\s+/).length < MIN_ANSWER_WORDS,
      }));

    const realAnswers = qa.filter((q) => !q.skipped);
    const skippedCount = qa.length - realAnswers.length;

    // No meaningful answers at all
    if (realAnswers.length === 0) {
      return NextResponse.json(
        { error: "No meaningful answers found. Please answer at least one question properly before generating feedback." },
        { status: 400 }
      );
    }

    let feedback: FeedbackReport;

    if (!process.env.GROQ_API_KEY) {
      feedback = MOCK_FEEDBACK;
    } else {
      // ── RAG: retrieve resume context for better feedback ──
      const ragContext = await buildFeedbackRAGContext(
        session.user.id,
        interviewSession.role,
        realAnswers
      );

      // Tell AI about skipped questions so score reflects reality
      const skippedNote = skippedCount > 0
        ? `\nNOTE: ${skippedCount} out of ${qa.length} questions were skipped or not answered properly. Factor this into the scores — skipped questions should significantly lower the technical and overall scores.\n`
        : "";

      const raw = await callGroq(FEEDBACK_SYSTEM, feedbackPrompt(realAnswers, "en", ragContext + skippedNote));
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
