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
  salaryNegotiationPrompt,
  linkedinMessagePrompt,
  companyResearchPrompt,
  atsScorePrompt,
  rejectionAnalyzerPrompt,
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

// ── Step 8: Salary Negotiation ───────────────────────────────────
export interface SalaryNegotiationResult {
  marketRange: { min: string; mid: string; max: string; currency: string; basis: string };
  recommendedAsk: string;
  confidence: "high" | "medium" | "low";
  openingScript: string;
  counterOfferScript: string;
  acceptanceScript: string;
  walkAwayPoint: string;
  negotiationTips: string[];
  nonSalaryBenefits: string[];
  redFlags: string[];
  strengthsToHighlight: string[];
}

const FALLBACK_SALARY: SalaryNegotiationResult = {
  marketRange: { min: "—", mid: "—", max: "—", currency: "INR", basis: "Could not analyze" },
  recommendedAsk: "—",
  confidence: "low",
  openingScript: "Salary negotiation analysis failed. Please try again.",
  counterOfferScript: "",
  acceptanceScript: "",
  walkAwayPoint: "—",
  negotiationTips: [],
  nonSalaryBenefits: [],
  redFlags: [],
  strengthsToHighlight: [],
};

export async function generateSalaryNegotiation(params: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText: string;
  currentOffer?: string;
}): Promise<SalaryNegotiationResult> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    salaryNegotiationPrompt(
      params.jobTitle, params.company, params.jobDescription,
      params.resumeText, params.currentOffer
    )
  );
  return safeJsonParse<SalaryNegotiationResult>(raw, FALLBACK_SALARY);
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

// ── Step 9: LinkedIn Message Generator ──────────────────────────
export interface LinkedInMessageTone {
  connectionNote: string;
  followUpDm: string;
  tip: string;
}

export interface LinkedInMessageResult {
  formal: LinkedInMessageTone;
  casual: LinkedInMessageTone;
  coldOutreach: LinkedInMessageTone;
  subjectLines: string[];
  dosList: string[];
  dontsList: string[];
}

const FALLBACK_LINKEDIN: LinkedInMessageResult = {
  formal:      { connectionNote: "", followUpDm: "", tip: "" },
  casual:      { connectionNote: "", followUpDm: "", tip: "" },
  coldOutreach:{ connectionNote: "", followUpDm: "", tip: "" },
  subjectLines: [],
  dosList: [],
  dontsList: [],
};

export async function generateLinkedInMessages(params: {
  recipientName: string;
  recipientRole: string;
  company: string;
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  senderName: string;
}): Promise<LinkedInMessageResult> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    linkedinMessagePrompt(
      params.recipientName, params.recipientRole, params.company,
      params.jobTitle, params.jobDescription, params.resumeText, params.senderName
    )
  );
  return safeJsonParse<LinkedInMessageResult>(raw, FALLBACK_LINKEDIN);
}

// ── Step 10: Company Research Agent ─────────────────────────────
export interface CompanyResearchResult {
  overview: { founded: string; headquarters: string; size: string; stage: string; revenue: string; tagline: string };
  products: { name: string; description: string }[];
  techStack: { frontend: string[]; backend: string[]; infrastructure: string[]; databases: string[]; aiMl: string[]; notes: string };
  culture: { workStyle: string; values: string[]; topPerks: string[]; dresscode: string; avgAge: string; glassdoorRating: string; summary: string };
  interviewProcess: {
    rounds: { round: number; type: string; duration: string; focus: string }[];
    difficulty: string;
    avgDuration: string;
    tips: string[];
    commonRejectionReasons: string[];
  };
  recentNews: { headline: string; date: string; relevance: string }[];
  competitors: string[];
  interviewQuestions: string[];
  smartThingsToSay: string[];
  redFlags: string[];
  verdict: { rating: string; summary: string; bestFor: string };
}

const FALLBACK_RESEARCH: CompanyResearchResult = {
  overview: { founded: "—", headquarters: "—", size: "—", stage: "—", revenue: "—", tagline: "—" },
  products: [], techStack: { frontend: [], backend: [], infrastructure: [], databases: [], aiMl: [], notes: "" },
  culture: { workStyle: "—", values: [], topPerks: [], dresscode: "—", avgAge: "—", glassdoorRating: "—", summary: "Research failed. Please try again." },
  interviewProcess: { rounds: [], difficulty: "—", avgDuration: "—", tips: [], commonRejectionReasons: [] },
  recentNews: [], competitors: [], interviewQuestions: [], smartThingsToSay: [], redFlags: [],
  verdict: { rating: "—", summary: "—", bestFor: "—" },
};

export async function generateCompanyResearch(params: {
  company: string;
  jobTitle: string;
  jobDescription: string;
}): Promise<CompanyResearchResult> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    companyResearchPrompt(params.company, params.jobTitle, params.jobDescription)
  );
  return safeJsonParse<CompanyResearchResult>(raw, FALLBACK_RESEARCH);
}

// ── Step 11: ATS Score Optimizer ─────────────────────────────────
export interface ATSKeyword {
  keyword: string;
  importance: "critical" | "important" | "nice-to-have";
  frequency?: number;
  whereToAdd?: string;
  suggestedLine?: string;
}

export interface ATSSectionScore {
  score: number;
  maxScore: number;
  issues: string[];
}

export interface ATSQuickFix {
  fix: string;
  impact: "high" | "medium" | "low";
  timeMinutes: number;
}

export interface ATSScoreResult {
  atsScore: number;
  verdict: "rejected" | "borderline" | "shortlisted" | "strong";
  verdictReason: string;
  keywordAnalysis: {
    totalRequired: number;
    found: number;
    missing: number;
    foundKeywords: ATSKeyword[];
    missingKeywords: ATSKeyword[];
  };
  sectionScores: {
    skills: ATSSectionScore;
    experience: ATSSectionScore;
    summary: ATSSectionScore;
    education: ATSSectionScore;
  };
  formattingIssues: string[];
  quickFixes: ATSQuickFix[];
  improvedScore: number;
  improvedVerdict: string;
  totalFixTime: string;
}

const FALLBACK_ATS: ATSScoreResult = {
  atsScore: 0,
  verdict: "rejected",
  verdictReason: "Analysis failed. Please try again.",
  keywordAnalysis: { totalRequired: 0, found: 0, missing: 0, foundKeywords: [], missingKeywords: [] },
  sectionScores: {
    skills:     { score: 0, maxScore: 100, issues: [] },
    experience: { score: 0, maxScore: 100, issues: [] },
    summary:    { score: 0, maxScore: 100, issues: [] },
    education:  { score: 0, maxScore: 100, issues: [] },
  },
  formattingIssues: [],
  quickFixes: [],
  improvedScore: 0,
  improvedVerdict: "—",
  totalFixTime: "—",
};

export async function generateATSScore(params: {
  resumeText: string;
  jobDescription: string;

}): Promise<ATSScoreResult> {
  const raw = await callGroq(JOB_AGENT_SYSTEM, atsScorePrompt(params.resumeText, params.jobDescription));
  return safeJsonParse<ATSScoreResult>(raw, FALLBACK_ATS);
}

// ── Step 12: Job Rejection Analyzer ─────────────────────────────
export interface RejectionReason {
  reason: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
}
export interface RejectionImprovement {
  area: string;
  action: string;
  priority: "high" | "medium" | "low";
}
export interface AlternativeRole {
  role: string;
  reason: string;
  companies: string[];
}
export interface RejectionAnalysisResult {
  rejectionType: "generic" | "skills_mismatch" | "overqualified" | "underqualified" | "culture_fit" | "budget" | "internal_hire" | "ghosted";
  tone: "polite" | "cold" | "encouraging" | "vague";
  wasHuman: boolean;
  likelyReasons: RejectionReason[];
  whatWentWell: string[];
  improvementAreas: RejectionImprovement[];
  alternativeRoles: AlternativeRole[];
  shouldReapply: boolean;
  reapplyAdvice: string;
  replyToRejection: string;
  emotionalNote: string;
  nextSteps: string[];
}

const FALLBACK_REJECTION: RejectionAnalysisResult = {
  rejectionType: "generic", tone: "polite", wasHuman: false,
  likelyReasons: [], whatWentWell: [], improvementAreas: [],
  alternativeRoles: [], shouldReapply: false,
  reapplyAdvice: "Analysis failed. Please try again.",
  replyToRejection: "", emotionalNote: "", nextSteps: [],
};

export async function analyzeRejection(params: {
  rejectionEmail: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText: string;
}): Promise<RejectionAnalysisResult> {
  const raw = await callGroq(
    JOB_AGENT_SYSTEM,
    rejectionAnalyzerPrompt(params.rejectionEmail, params.jobTitle, params.company, params.jobDescription, params.resumeText)
  );
  return safeJsonParse<RejectionAnalysisResult>(raw, FALLBACK_REJECTION);
}
