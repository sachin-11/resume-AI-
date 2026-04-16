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
import { getPersona } from "@/lib/personas";
import { canCreateInterview } from "@/lib/stripe";

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

    const { resumeId, role, difficulty, roundType, questionCount, customQuestionIds, persona: personaId } = parsed.data;
    const persona = getPersona(personaId ?? "friendly");

    // ── Plan limit check ─────────────────────────────────────
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, interviewsThisMonth: true, monthResetAt: true },
    });

    // Reset monthly count if new month
    const now = new Date();
    if (!user?.monthResetAt || now.getMonth() !== user.monthResetAt.getMonth() || now.getFullYear() !== user.monthResetAt.getFullYear()) {
      await db.user.update({ where: { id: session.user.id }, data: { interviewsThisMonth: 0, monthResetAt: now } });
    } else if (!canCreateInterview(user?.plan ?? "free", user?.interviewsThisMonth ?? 0)) {
      return NextResponse.json({
        error: "Monthly interview limit reached. Upgrade to Pro for unlimited interviews.",
        limitReached: true,
      }, { status: 403 });
    }

    let resumeText = "";
    if (resumeId) {
      const resume = await db.resume.findFirst({
        where: { id: resumeId, userId: session.user.id },
      });
      resumeText = resume?.rawText ?? "";
    }

    // ── Fetch custom questions from bank ────────────────────
    let customQuestions: GeneratedQuestion[] = [];
    if (customQuestionIds?.length) {
      const bankQs = await db.questionBank.findMany({
        where: { id: { in: customQuestionIds }, userId: session.user.id, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      customQuestions = bankQs.map((q, i) => ({
        text: q.text,
        type: "main" as const,
        orderIndex: i + 1,
        source: "custom" as const,
      }));
    }

    // ── AI questions (fill remaining slots) ─────────────────
    const aiCount = Math.max(0, questionCount - customQuestions.length);
    let aiQuestions: GeneratedQuestion[] = [];

    if (aiCount > 0) {
      if (!process.env.GROQ_API_KEY) {
        const base = MOCK_QUESTIONS[roundType] ?? MOCK_QUESTIONS.technical;
        aiQuestions = base.slice(0, aiCount).map((q, i) => ({ ...q, orderIndex: i + 1 }));
      } else {
        const raw = await callGroq(
          QUESTION_GENERATION_SYSTEM,
          questionGenerationPrompt({ resumeText, role, difficulty, roundType, count: aiCount, personaPrompt: persona.systemPrompt })
        );
        const parsed_q = safeJsonParse<GeneratedQuestion[]>(raw, MOCK_QUESTIONS.technical);
        aiQuestions = parsed_q.slice(0, aiCount).map((q, i) => ({ ...q, orderIndex: i + 1 }));
      }
    }

    // Custom first, then AI — reindex
    const questions: GeneratedQuestion[] = [
      ...customQuestions,
      ...aiQuestions,
    ].map((q, i) => ({ ...q, orderIndex: i + 1 }));

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
        persona: personaId ?? "friendly",
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

    // Increment monthly interview count
    await db.user.update({
      where: { id: session.user.id },
      data: { interviewsThisMonth: { increment: 1 } },
    });

    return NextResponse.json({ session: interviewSession }, { status: 201 });
  } catch (err) {
    console.error("[INTERVIEW_CREATE]", err);    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }
}
