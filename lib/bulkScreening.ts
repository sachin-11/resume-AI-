/**
 * Bulk resume screening (Job Match page) — shared shapes.
 * The AI work runs on agent-service (job "bulk-screening": the same screening
 * agent, guardrails and decision policy as one-off screening, over ≤ 50 resumes
 * in parallel). Results are saved into ResumeMatch by the save route.
 */

export const BULK_SCREENING_MAX = 50;

export type Recommendation = "strong_match" | "good_match" | "partial_match" | "weak_match";

/** UI label from the agent's policy decision (the decision follows from the score). */
export function toRecommendation(decision: string, rating: number): Recommendation {
  if (decision === "shortlist") return rating >= 85 ? "strong_match" : "good_match";
  if (decision === "maybe") return "partial_match";
  return "weak_match";
}

export interface RankedRow {
  resumeId: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  recommendation: string;
  reviewReasons: string[];
  resume: { fileName: string };
  createdAt?: Date;
}

export function toRanked(rows: RankedRow[]) {
  return [...rows]
    .sort((a, b) => b.score - a.score)
    .map((m, idx) => ({
      rank: idx + 1,
      resumeId: m.resumeId,
      fileName: m.resume.fileName,
      score: m.score,
      matchedSkills: m.matchedSkills,
      missingSkills: m.missingSkills,
      summary: m.summary,
      recommendation: m.recommendation,
      reviewReasons: m.reviewReasons,
      analyzedAt: m.createdAt,
    }));
}
