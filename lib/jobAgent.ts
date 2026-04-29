/**
 * Job Application Agent — Core Engine
 *
 * Agentic pipeline:
 * 1. Analyze resume vs JD (gap analysis)
 * 2. Generate cover letter
 * 3. Generate interview questions
 * 4. Build application checklist
 */

import { callGroq } from "@/lib/groq";
import { safeJsonParse } from "@/lib/utils";
import {
  JOB_AGENT_SYSTEM,
  gapAnalysisPrompt,
  coverLetterPrompt,
  interviewQuestionsPrompt,
  applicationChecklistPrompt,
  resumeTailorPrompt,
  jdExtractPrompt,
  followUpEmailPrompt,
} from "@/lib/jobAgentPrompts";

// ── Types ────────────────────────────────────────────────────────
export interface GapAnalysis {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceGaps: string[];
  strengths: string[];
  quickWins: string[];
  overallVerdict: string;
  hiringChance: "high" | "medium" | "low";
}

export interface CoverLetterResult {
  subject: string;
  coverLetter: string;
  keyPointsUsed: string[];
  customizationTips: string[];
}

export interface InterviewQuestion {
  question: string;
  why: string;
  tipToAnswer: string;
}

export interface InterviewQuestionsResult {
  technical: InterviewQuestion[];
  behavioral: InterviewQuestion[];
  roleSpecific: InterviewQuestion[];
  questionsToAsk: string[];
}

export interface ChecklistStep {
  step: number;
  category: string;
  action: string;
  priority: "high" | "medium" | "low";
  timeEstimate: string;
  done: boolean;
}

export interface ApplicationChecklist {
  checklist: ChecklistStep[];
  totalEstimatedTime: string;
  priorityActions: string[];
  redFlags: string[];
  applicationStrategy: string;
}

// ── Fallbacks ────────────────────────────────────────────────────
const FALLBACK_GAP: GapAnalysis = {
  matchScore: 0, matchedSkills: [], missingSkills: [],
  experienceGaps: [], strengths: [], quickWins: [],
  overallVerdict: "Analysis failed. Please try again.",
  hiringChance: "medium",
};

const FALLBACK_COVER: CoverLetterResult = {
  subject: "", coverLetter: "Cover letter generation failed. Please try again.",
  keyPointsUsed: [], customizationTips: [],
};

const FALLBACK_QUESTIONS: InterviewQuestionsResult = {
  technical: [], behavioral: [], roleSpecific: [], questionsToAsk: [],
};

const FALLBACK_CHECKLIST: ApplicationChecklist = {
  checklist: [], totalEstimatedTime: "Unknown",
  priorityActions: [], redFlags: [], applicationStrategy: "",
};

// ── Step 1: Gap Analysis ─────────────────────────────────────────
export async function analyzeGap(
  resumeText: string,
  jobDescription: string
): Promise<GapAnalysis> {
  const raw = await callGroq(JOB_AGENT_SYSTEM, gapAnalysisPrompt(resumeText, jobDescription));
  return safeJsonParse<GapAnalysis>(raw, FALLBACK_GAP);
}

// ── Step 2: Cover Letter ─────────────────────────────────────────
export async function generateCoverLetter(
  resumeText: string,
  jobDescription: string,
  jobTitle: string,
  company: string,
  tone: "professional" | "enthusiastic" | "concise" = "professional"
): Promise<CoverLetterResult> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    coverLetterPrompt(resumeText, jobDescription, jobTitle, company, tone)
  );
  return safeJsonParse<CoverLetterResult>(raw, FALLBACK_COVER);
}

// ── Step 3: Interview Questions ──────────────────────────────────
export async function generateInterviewQuestions(
  resumeText: string,
  jobDescription: string,
  jobTitle: string
): Promise<InterviewQuestionsResult> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    interviewQuestionsPrompt(resumeText, jobDescription, jobTitle)
  );
  return safeJsonParse<InterviewQuestionsResult>(raw, FALLBACK_QUESTIONS);
}

// ── Step 4: Application Checklist ───────────────────────────────
export async function generateChecklist(
  resumeText: string,
  jobDescription: string,
  jobTitle: string,
  company: string
): Promise<ApplicationChecklist> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    applicationChecklistPrompt(resumeText, jobDescription, jobTitle, company)
  );
  return safeJsonParse<ApplicationChecklist>(raw, FALLBACK_CHECKLIST);
}

// ── Full Pipeline (all 4 steps) ──────────────────────────────────
export async function runFullAgentPipeline(params: {
  resumeText: string;
  jobDescription: string;
  jobTitle: string;
  company: string;
  tone?: "professional" | "enthusiastic" | "concise";
}): Promise<{
  gap: GapAnalysis;
  coverLetter: CoverLetterResult;
  questions: InterviewQuestionsResult;
  checklist: ApplicationChecklist;
}> {
  const { resumeText, jobDescription, jobTitle, company, tone = "professional" } = params;

  // Run gap analysis first (others depend on context), then parallelize the rest
  const gap = await analyzeGap(resumeText, jobDescription);

  const [coverLetter, questions, checklist] = await Promise.all([
    generateCoverLetter(resumeText, jobDescription, jobTitle, company, tone),
    generateInterviewQuestions(resumeText, jobDescription, jobTitle),
    generateChecklist(resumeText, jobDescription, jobTitle, company),
  ]);

  return { gap, coverLetter, questions, checklist };
}

// ── Types: Level 2 ───────────────────────────────────────────────
export interface TailoredBullet {
  section: string;
  company: string;
  original: string;
  improved: string;
  reason: string;
}

export interface ResumeTailorResult {
  tailoredBullets: TailoredBullet[];
  keywordsAdded: string[];
  summaryRewrite: string;
  titleSuggestion: string;
}

export interface JDExtractResult {
  jobTitle: string;
  company: string;
  location: string;
  jobType: string;
  salary: string | null;
  jobDescription: string;
  requiredSkills: string[];
  experienceRequired: string;
  extractionSuccess: boolean;
}

export interface FollowUpEmailResult {
  subject: string;
  emailBody: string;
  tone: string;
  sendTiming: string;
  followUpTip: string;
}

// ── Fallbacks: Level 2 ──────────────────────────────────────────
const FALLBACK_TAILOR: ResumeTailorResult = {
  tailoredBullets: [], keywordsAdded: [],
  summaryRewrite: "", titleSuggestion: "",
};

const FALLBACK_JD: JDExtractResult = {
  jobTitle: "", company: "", location: "", jobType: "",
  salary: null, jobDescription: "", requiredSkills: [],
  experienceRequired: "", extractionSuccess: false,
};

const FALLBACK_FOLLOWUP: FollowUpEmailResult = {
  subject: "", emailBody: "Could not generate email. Please try again.",
  tone: "professional", sendTiming: "", followUpTip: "",
};

// ── Step 5: Resume Auto-Tailor ───────────────────────────────────
export async function tailorResume(
  resumeText: string,
  jobDescription: string
): Promise<ResumeTailorResult> {
  const raw = await callGroq(JOB_AGENT_SYSTEM, resumeTailorPrompt(resumeText, jobDescription));
  return safeJsonParse<ResumeTailorResult>(raw, FALLBACK_TAILOR);
}

// ── Step 6: JD URL Scraper ───────────────────────────────────────
export async function extractJDFromUrl(url: string): Promise<JDExtractResult> {
  // Fetch the page
  let pageText = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    // Strip HTML tags to get plain text
    pageText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  } catch (err) {
    console.error("[JD_SCRAPE] Fetch failed:", err);
    return { ...FALLBACK_JD, extractionSuccess: false };
  }

  if (!pageText || pageText.length < 100) return { ...FALLBACK_JD, extractionSuccess: false };

  const raw = await callGroq(JOB_AGENT_SYSTEM, jdExtractPrompt(pageText));
  return safeJsonParse<JDExtractResult>(raw, FALLBACK_JD);
}

// ── Step 7: Follow-up Email ──────────────────────────────────────
export async function generateFollowUpEmail(params: {
  jobTitle: string;
  company: string;
  candidateName: string;
  daysSinceApplied: number;
  stage: "after_apply" | "after_interview" | "no_response";
}): Promise<FollowUpEmailResult> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    followUpEmailPrompt(
      params.jobTitle, params.company, params.candidateName,
      params.daysSinceApplied, params.stage
    )
  );
  return safeJsonParse<FollowUpEmailResult>(raw, FALLBACK_FOLLOWUP);
}
