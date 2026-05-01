import { callGroq } from "@/lib/groq";
import {
  FOLLOWUP_SYSTEM,
  CONFIDENCE_SYSTEM,
  confidenceAnalysisPrompt,
  adaptiveFollowupPrompt,
  type AdaptiveFollowupMode,
} from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";

export interface ConfidenceResult {
  confidenceScore: number;
  qualityScore: number;
  tone: "confident" | "hesitant" | "confused" | "strong" | "nervous";
  signal: "follow_up" | "next_level" | "easier" | "proceed" | "clarify";
  indicators: string[];
  aiAction: string;
  nextQuestionLevel: "harder" | "same" | "easier";
}

export const FALLBACK_CONFIDENCE: ConfidenceResult = {
  confidenceScore: 60,
  qualityScore: 60,
  tone: "confident",
  signal: "proceed",
  indicators: [],
  aiAction: "",
  nextQuestionLevel: "same",
};

const VALID_SIGNALS = new Set<ConfidenceResult["signal"]>(["follow_up", "next_level", "easier", "proceed", "clarify"]);
const VALID_TONES = new Set<ConfidenceResult["tone"]>(["confident", "hesitant", "confused", "strong", "nervous"]);

function clampScore(n: unknown, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeConfidence(parsed: Partial<ConfidenceResult>): ConfidenceResult {
  const signal =
    parsed.signal && VALID_SIGNALS.has(parsed.signal as ConfidenceResult["signal"])
      ? (parsed.signal as ConfidenceResult["signal"])
      : FALLBACK_CONFIDENCE.signal;
  const tone =
    parsed.tone && VALID_TONES.has(parsed.tone as ConfidenceResult["tone"])
      ? (parsed.tone as ConfidenceResult["tone"])
      : FALLBACK_CONFIDENCE.tone;
  const nextQuestionLevel =
    parsed.nextQuestionLevel === "harder" || parsed.nextQuestionLevel === "same" || parsed.nextQuestionLevel === "easier"
      ? parsed.nextQuestionLevel
      : FALLBACK_CONFIDENCE.nextQuestionLevel;
  const indicators = Array.isArray(parsed.indicators)
    ? parsed.indicators.filter((x): x is string => typeof x === "string").slice(0, 8)
    : [];
  return {
    confidenceScore: clampScore(parsed.confidenceScore, FALLBACK_CONFIDENCE.confidenceScore),
    qualityScore: clampScore(parsed.qualityScore, FALLBACK_CONFIDENCE.qualityScore),
    tone,
    signal,
    indicators,
    aiAction: typeof parsed.aiAction === "string" ? parsed.aiAction : "",
    nextQuestionLevel,
  };
}

/** If null, skip LLM follow-up and advance to next bank question. */
export function decideFollowupMode(c: ConfidenceResult): AdaptiveFollowupMode | null {
  let effectiveSignal = c.signal;

  if (
    effectiveSignal === "proceed" &&
    (c.tone === "hesitant" || c.tone === "nervous") &&
    c.confidenceScore < 52
  ) {
    effectiveSignal = "follow_up";
  }
  if (effectiveSignal === "proceed" && c.tone === "confused") {
    effectiveSignal = "clarify";
  }

  switch (effectiveSignal) {
    case "next_level":
      return "next_level";
    case "follow_up":
      return "probe";
    case "clarify":
      return "clarify";
    case "easier":
      return "easier";
    default:
      return null;
  }
}

/**
 * Runs confidence JSON analysis, then optionally generates one adaptive follow-up question.
 * Safe to run in parallel with `db.answer.create`.
 */
export async function analyzeAnswerAndMaybeFollowup(
  questionText: string,
  answerText: string,
  hasLlm: boolean
): Promise<{ confidence: ConfidenceResult; followupText: string | null }> {
  if (!hasLlm) {
    return { confidence: FALLBACK_CONFIDENCE, followupText: null };
  }

  const confidenceRaw = await callGroq(
    CONFIDENCE_SYSTEM,
    confidenceAnalysisPrompt(questionText, answerText)
  ).catch(() => null);

  const confidence: ConfidenceResult = confidenceRaw
    ? normalizeConfidence(safeJsonParse<Partial<ConfidenceResult>>(confidenceRaw, {}))
    : FALLBACK_CONFIDENCE;

  const followupMode = decideFollowupMode(confidence);
  if (!followupMode) {
    return { confidence, followupText: null };
  }

  const followupText = await callGroq(
    FOLLOWUP_SYSTEM,
    adaptiveFollowupPrompt(questionText, answerText, followupMode)
  )
    .then((t) => t.trim())
    .catch(() => null);

  return { confidence, followupText };
}
