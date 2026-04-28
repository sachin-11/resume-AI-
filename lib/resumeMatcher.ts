/**
 * Resume ↔ Job Description Matching
 *
 * Flow:
 * 1. Parse JD to extract required skills / experience
 * 2. Compare each resume's rawText against JD
 * 3. AI scores candidate 0-100, detects missing skills, gives recommendation
 * 4. Returns ranked list
 */

import { callGroq } from "@/lib/groq";
import { safeJsonParse } from "@/lib/utils";

export interface MatchResult {
  resumeId: string;
  score: number;                  // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  recommendation: "strong_match" | "good_match" | "partial_match" | "weak_match";
}

const SYSTEM_PROMPT = `You are an expert technical recruiter and resume analyst.
Your job is to evaluate how well a candidate's resume matches a job description.
Return ONLY valid JSON — no markdown, no explanation.`;

function buildPrompt(resumeText: string, jobDescription: string): string {
  return `
JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

CANDIDATE RESUME:
${resumeText.slice(0, 3000)}

Analyze the resume against the job description and return this exact JSON:
{
  "score": <integer 0-100>,
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "summary": "<2-3 sentence evaluation of the candidate>",
  "recommendation": "<one of: strong_match | good_match | partial_match | weak_match>"
}

Scoring guide:
- 85-100: strong_match — meets almost all requirements
- 65-84:  good_match   — meets most requirements, minor gaps
- 40-64:  partial_match — meets some requirements, notable gaps
- 0-39:   weak_match   — significant mismatch
`;
}

export async function matchResumeToJD(
  resumeId: string,
  resumeText: string,
  jobDescription: string
): Promise<MatchResult> {
  const raw = await callGroq(SYSTEM_PROMPT, buildPrompt(resumeText, jobDescription));

  const fallback: MatchResult = {
    resumeId,
    score: 0,
    matchedSkills: [],
    missingSkills: [],
    summary: "Could not analyze resume.",
    recommendation: "weak_match",
  };

  const parsed = safeJsonParse<Omit<MatchResult, "resumeId">>(raw, fallback);

  return {
    resumeId,
    score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
    matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills : [],
    missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : [],
    summary: parsed.summary ?? "",
    recommendation: (["strong_match", "good_match", "partial_match", "weak_match"].includes(parsed.recommendation)
      ? parsed.recommendation
      : "weak_match") as MatchResult["recommendation"],
  };
}

/** Match multiple resumes concurrently (max 5 at a time to avoid rate limits) */
export async function matchAllResumes(
  resumes: { id: string; rawText: string }[],
  jobDescription: string
): Promise<MatchResult[]> {
  const BATCH = 5;
  const results: MatchResult[] = [];

  for (let i = 0; i < resumes.length; i += BATCH) {
    const batch = resumes.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((r) => matchResumeToJD(r.id, r.rawText, jobDescription))
    );
    results.push(...batchResults);
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}
