import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { QUESTION_GENERATION_SYSTEM, questionGenerationPrompt, PANEL_QUESTION_SYSTEM, panelInterviewPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import { GeneratedQuestion } from "@/types";
import { interviewSetupSchema } from "@/lib/validations";
import { MOCK_QUESTIONS, buildMockPanelQuestions } from "@/lib/mockData";
import { getPersona } from "@/lib/personas";
import { canCreateInterview } from "@/lib/stripe";
import { buildRAGContext } from "@/lib/rag";

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

    const {
      resumeId, role, difficulty, roundType, questionCount, customQuestionIds, persona: personaId,
      panelInterview, pairProgramming,
    } = parsed.data;
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
      if (panelInterview) {
        if (!process.env.GROQ_API_KEY) {
          aiQuestions = buildMockPanelQuestions(aiCount, { pairProgramming });
        } else {
          const ragContext = resumeId
            ? await buildRAGContext(session.user.id, role, roundType)
            : "";
          const langPrefix = undefined; // setup form has no language in create — session default en
          const raw = await callGroq(
            PANEL_QUESTION_SYSTEM,
            panelInterviewPrompt({
              resumeText,
              role,
              difficulty,
              count: aiCount,
              pairProgramming,
              ragContext,
              personaPrompt: persona.systemPrompt,
            })
          );
          const parsed_q = safeJsonParse<GeneratedQuestion[]>(raw, []);
          const cycle: Array<"technical" | "hr" | "domain"> = ["technical", "hr", "domain"];
          aiQuestions = parsed_q.slice(0, aiCount).map((q, i) => {
            const agent = (q.panelAgent === "technical" || q.panelAgent === "hr" || q.panelAgent === "domain"
              ? q.panelAgent
              : cycle[i % 3]);
            return {
              ...q,
              text: q.text,
              type: "main" as const,
              orderIndex: i + 1,
              panelAgent: agent,
              starterCode:
                typeof q.starterCode === "string" && q.starterCode.trim() ? q.starterCode.trim() : undefined,
              codeLanguage:
                typeof q.codeLanguage === "string" && q.codeLanguage.trim() ? q.codeLanguage.trim() : undefined,
            };
          });
        }
      } else if (!process.env.GROQ_API_KEY) {
        const base = MOCK_QUESTIONS[roundType] ?? MOCK_QUESTIONS.technical;
        aiQuestions = base.slice(0, aiCount).map((q, i) => ({
          ...q,
          orderIndex: i + 1,
          ...(pairProgramming && roundType === "technical"
            ? {
                starterCode: `// Pair mode — complete this stub
function solve(input) {
  // TODO: implement
  return null;
}`,
                codeLanguage: "javascript",
              }
            : {}),
        }));
      } else {
        const ragContext = resumeId
          ? await buildRAGContext(session.user.id, role, roundType)
          : "";

        const raw = await callGroq(
          QUESTION_GENERATION_SYSTEM,
          questionGenerationPrompt({
            resumeText,
            role,
            difficulty,
            roundType,
            count: aiCount,
            personaPrompt: persona.systemPrompt,
            ragContext,
            pairProgramming: pairProgramming && roundType === "technical",
          })
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
        title: panelInterview
          ? `${role} — 3-AI panel`
          : `${role} - ${roundType.replace("_", " ")} Round`,
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

    // Set new columns via raw SQL (Prisma client needs regeneration for new fields)
    await db.$executeRaw`
      UPDATE "InterviewSession"
      SET "panelInterview" = ${panelInterview ?? false},
          "pairProgramming" = ${pairProgramming ?? false}
      WHERE id = ${interviewSession.id}
    `;

    // Update question new fields via raw SQL
    for (const q of questions) {
      const dbQ = interviewSession.questions.find((dq) => dq.orderIndex === q.orderIndex);
      if (!dbQ) continue;
      if (q.panelAgent || q.starterCode || q.codeLanguage) {
        await db.$executeRaw`
          UPDATE "Question"
          SET "panelAgent" = ${q.panelAgent ?? null},
              "starterCode" = ${q.starterCode ?? null},
              "codeLanguage" = ${q.codeLanguage ?? null}
          WHERE id = ${dbQ.id}
        `;
      }
    }

    // Re-fetch with updated fields
    const updatedSession = await db.interviewSession.findFirst({
      where: { id: interviewSession.id },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
    });

    // Increment monthly interview count
    await db.user.update({
      where: { id: session.user.id },
      data: { interviewsThisMonth: { increment: 1 } },
    });

    return NextResponse.json({ session: updatedSession ?? interviewSession }, { status: 201 });
  } catch (err) {
    console.error("[INTERVIEW_CREATE]", err);    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }
}
