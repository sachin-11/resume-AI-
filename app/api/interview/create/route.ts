import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { QUESTION_GENERATION_SYSTEM, questionGenerationPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import { GeneratedQuestion } from "@/types";
import { interviewSetupSchema } from "@/lib/validations";
import { MOCK_QUESTIONS } from "@/lib/mockData";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = interviewSetupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { resumeId, role, difficulty, roundType, questionCount } = parsed.data;

    let resumeText = "";
    if (resumeId) {
      const resume = await db.resume.findFirst({
        where: { id: resumeId, userId: session.user.id },
      });
      resumeText = resume?.rawText ?? "";
    }

    let questions: GeneratedQuestion[];

    if (!process.env.GROQ_API_KEY) {
      // Use mock but prefix resume-based ones if resume text exists
      const base = MOCK_QUESTIONS[roundType] ?? MOCK_QUESTIONS.technical;
      if (resumeText) {
        const resumeCount = Math.max(1, Math.round(base.length * 0.6));
        questions = base.map((q, i) => ({
          ...q,
          text: i < resumeCount
            ? `[Based on your resume] ${q.text}`
            : q.text,
        }));
      } else {
        questions = base;
      }
    } else {
      const raw = await callGroq(
        QUESTION_GENERATION_SYSTEM,
        questionGenerationPrompt({ resumeText, role, difficulty, roundType, count: questionCount })
      );
      const parsed_q = safeJsonParse<GeneratedQuestion[]>(raw, MOCK_QUESTIONS.technical);
      // Ensure orderIndex is set correctly
      questions = parsed_q.map((q, i) => ({ ...q, orderIndex: i + 1 }));
    }

    const interviewSession = await db.interviewSession.create({
      data: {
        userId: session.user.id,
        resumeId: resumeId ?? null,
        title: `${role} - ${roundType.replace("_", " ")} Round`,
        role,
        difficulty,
        roundType,
        totalQuestions: questions.length,
        status: "active",
        questions: {
          create: questions.map((q) => ({
            text: q.text,
            type: q.type,
            orderIndex: q.orderIndex,
          })),
        },
      },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
    });

    return NextResponse.json({ session: interviewSession }, { status: 201 });
  } catch (err) {
    console.error("[INTERVIEW_CREATE]", err);
    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }
}
