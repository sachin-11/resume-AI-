import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { QUESTION_GENERATION_SYSTEM, questionGenerationPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import type { GeneratedQuestion } from "@/types";
import { MOCK_QUESTIONS } from "@/lib/mockData";
import { getPersona } from "@/lib/personas";
import { buildRAGContext } from "@/lib/rag";

const DIFF_ORDER = ["beginner", "intermediate", "advanced"] as const;

/** After first 3 main answers: high combined score → harder; low → easier. */
const CHECKPOINT_HIGH_AVG = 88;
const CHECKPOINT_LOW_AVG = 42;

export function stepDifficulty(current: string, dir: "up" | "down"): string {
  const idx = DIFF_ORDER.indexOf(current as (typeof DIFF_ORDER)[number]);
  const i = idx === -1 ? 1 : idx;
  if (dir === "up") return DIFF_ORDER[Math.min(DIFF_ORDER.length - 1, i + 1)];
  return DIFF_ORDER[Math.max(0, i - 1)];
}

export type AdaptiveCheckpointResult = {
  applied: boolean;
  direction?: "harder" | "easier" | "neutral";
  message?: string;
  newDifficulty?: string;
  updatedQuestions?: Array<{ id: string; text: string; orderIndex: number; type: string }>;
};

/**
 * Runs once per session when the first 3 *main* questions (non-followup) all have an answer.
 * Adjusts session difficulty and rewrites text of remaining unanswered main questions when appropriate.
 */
export async function runAdaptiveCheckpoint(params: {
  sessionId: string;
  userId: string;
  hasLlm: boolean;
}): Promise<AdaptiveCheckpointResult> {
  const { sessionId, userId, hasLlm } = params;

  const interview = await db.interviewSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
        include: { answers: { orderBy: { createdAt: "asc" }, take: 1 } },
      },
    },
  });

  if (!interview || interview.adaptiveCheckpointDone) {
    return { applied: false };
  }

  const mains = interview.questions.filter((q) => q.type !== "followup");
  const first3 = mains.slice(0, 3);
  if (first3.length < 3 || !first3.every((q) => q.answers.length > 0)) {
    return { applied: false };
  }

  const combinedScores = first3.map((q) => {
    const a = q.answers[0];
    const qv = a.qualityScore ?? 60;
    const cv = a.confidenceScore ?? 60;
    return (qv + cv) / 2;
  });
  const avg = combinedScores.reduce((s, x) => s + x, 0) / 3;

  let direction: "harder" | "easier" | "neutral" = "neutral";
  let newDifficulty = interview.difficulty;
  let message: string | undefined;

  if (avg >= CHECKPOINT_HIGH_AVG && interview.difficulty !== "advanced") {
    direction = "harder";
    newDifficulty = stepDifficulty(interview.difficulty, "up");
    message =
      "Candidate strong hai — pehle 3 jawab bahut acchhe. Aage ke questions ab harder level par.";
  } else if (avg <= CHECKPOINT_LOW_AVG && interview.difficulty !== "beginner") {
    direction = "easier";
    newDifficulty = stepDifficulty(interview.difficulty, "down");
    message =
      "Candidate struggle kar raha hai — baaki questions ab easier level par, flow banaane ke liye.";
  } else if (avg >= CHECKPOINT_HIGH_AVG) {
    message =
      "Pehle 3 jawab strong — tum already highest difficulty par ho; isi pace par aage badhte hain.";
  } else if (avg <= CHECKPOINT_LOW_AVG) {
    message =
      "Shuruaat tough rahi — hum already easiest level par hain; calmly aage ke questions try karo.";
  }

  const remaining = mains.slice(3).filter((q) => q.answers.length === 0);
  const shouldRegen =
    (direction === "harder" || direction === "easier") && remaining.length > 0;

  let updatedQuestions: AdaptiveCheckpointResult["updatedQuestions"];

  if (shouldRegen && hasLlm) {
    let resumeText = "";
    if (interview.resumeId) {
      const resume = await db.resume.findFirst({
        where: { id: interview.resumeId, userId },
      });
      resumeText = resume?.rawText ?? "";
    }
    const persona = getPersona(interview.persona ?? "friendly");
    const ragContext = interview.resumeId
      ? await buildRAGContext(userId, interview.role, interview.roundType)
      : "";

    const count = remaining.length;
    const langPrefix = interview.language?.split("-")[0];
    const language =
      langPrefix && langPrefix !== "en" ? langPrefix : undefined;

    const raw = await callGroq(
      QUESTION_GENERATION_SYSTEM,
      questionGenerationPrompt({
        resumeText,
        role: interview.role,
        difficulty: newDifficulty,
        roundType: interview.roundType,
        count,
        language,
        personaPrompt: persona.systemPrompt,
        ragContext,
      })
    );
    const parsed = safeJsonParse<GeneratedQuestion[]>(raw, []);
    const pool = parsed.length >= count ? parsed.slice(0, count) : null;

    if (pool && pool.length === count) {
      updatedQuestions = [];
      for (let i = 0; i < count; i++) {
        const qRow = remaining[i];
        const gen = pool[i];
        await db.question.update({
          where: { id: qRow.id },
          data: { text: gen.text },
        });
        updatedQuestions.push({
          id: qRow.id,
          text: gen.text,
          orderIndex: qRow.orderIndex,
          type: qRow.type,
        });
      }
    }
  } else if (shouldRegen && !hasLlm) {
    const base = MOCK_QUESTIONS[interview.roundType] ?? MOCK_QUESTIONS.technical;
    let idx = 0;
    updatedQuestions = [];
    for (const qRow of remaining) {
      const gen = base[idx % base.length];
      idx++;
      const text = gen?.text ? `[${newDifficulty}] ${gen.text}` : qRow.text;
      await db.question.update({ where: { id: qRow.id }, data: { text } });
      updatedQuestions.push({
        id: qRow.id,
        text,
        orderIndex: qRow.orderIndex,
        type: qRow.type,
      });
    }
  }

  await db.interviewSession.update({
    where: { id: sessionId },
    data: {
      adaptiveCheckpointDone: true,
      difficulty: newDifficulty,
      adaptiveAdjustment: direction,
      adaptiveNote: message ?? null,
    },
  });

  return {
    applied: true,
    direction,
    message,
    newDifficulty,
    updatedQuestions,
  };
}
