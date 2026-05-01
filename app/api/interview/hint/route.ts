/**
 * POST /api/interview/hint
 *
 * Progressive hint system — each call gives a slightly bigger hint.
 * Hint level: 1 (small nudge) → 2 (direction) → 3 (near-answer)
 *
 * Body: { questionId, sessionId, hintLevel, questionText }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callGroq } from "@/lib/groq";
import { safeJsonParse } from "@/lib/utils";

const HINT_SYSTEM = `You are a helpful interview coach giving progressive hints to a candidate who is stuck.
Give hints that guide without giving away the answer. Return only valid JSON.`;

function hintPrompt(question: string, hintLevel: number): string {
  const levelGuide = {
    1: "Give a very small nudge — just point them in the right direction without revealing anything. 1 sentence max.",
    2: "Give a moderate hint — mention the key concept or approach they should think about. 2 sentences max.",
    3: "Give a strong hint — almost reveal the answer, just leave the final step for them. 3 sentences max.",
  }[hintLevel] ?? "Give a small hint.";

  return `The candidate is stuck on this interview question. ${levelGuide}

Return ONLY this JSON:
{
  "hint": "Your hint text here",
  "scorePenalty": 5,
  "encouragement": "Short encouraging message"
}

scorePenalty: points deducted from final score (level 1=5, level 2=10, level 3=15)
encouragement: 1 short sentence to keep candidate motivated

Question: "${question}"
Hint Level: ${hintLevel}/3`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { questionText, hintLevel = 1 } = await req.json();
  if (!questionText) return NextResponse.json({ error: "questionText required" }, { status: 400 });

  const level = Math.min(3, Math.max(1, Number(hintLevel)));

  try {
    const raw = await callGroq(HINT_SYSTEM, hintPrompt(questionText, level));
    const result = safeJsonParse(raw, {
      hint: "Think about the core concept behind this question.",
      scorePenalty: level * 5,
      encouragement: "You've got this! Take your time.",
    });

    return NextResponse.json({
      hint: result.hint,
      scorePenalty: result.scorePenalty ?? level * 5,
      encouragement: result.encouragement ?? "Keep going!",
      hintLevel: level,
      nextHintAvailable: level < 3,
    });
  } catch (err) {
    console.error("[HINT]", err);
    return NextResponse.json({ error: "Failed to generate hint" }, { status: 500 });
  }
}
