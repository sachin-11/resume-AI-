export interface ResumeAnalysis {
  // Basic
  skills: string[];
  strengths: string[];
  missingSkills: string[];
  atsSuggestions: string[];
  betterSummary: string;
  careerRecommendations: string[];
  experienceLevel: "junior" | "mid" | "senior";
  detectedRole: string;
  yearsOfExperience: number;
  educationLevel: string;
  overallScore: number;

  // Structured data (new)
  structuredData?: {
    contactInfo: { name?: string; email?: string; phone?: string; location?: string; linkedin?: string; github?: string };
    summary?: string;
    experience: Array<{ company: string; role: string; duration: string; highlights: string[] }>;
    education: Array<{ institution: string; degree: string; year?: string }>;
    skillsByCategory: { languages: string[]; frameworks: string[]; databases: string[]; tools: string[]; cloud: string[]; other: string[] };
    certifications: string[];
    projects: Array<{ name: string; tech: string[]; description: string }>;
  };

  // ATS match (populated when JD is provided)
  atsMatch?: {
    score: number;                  // 0-100
    matchedKeywords: string[];      // found in both resume & JD
    missingKeywords: string[];      // in JD but not in resume
    extraKeywords: string[];        // in resume but not in JD
    recommendation: string;
  };
}

export interface GeneratedQuestion {
  text: string;
  type: "main" | "followup";
  hint?: string;
  orderIndex: number;
  source?: string;
  /** 3-agent panel: who is asking */
  panelAgent?: "technical" | "hr" | "domain";
  /** Pair programming: incomplete starter the candidate must finish */
  starterCode?: string;
  codeLanguage?: string;
}

export interface FeedbackReport {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
  strengths: string[];
  weakAreas: string[];
  betterAnswers: Array<{ question: string; improvedAnswer: string; candidateAnswer?: string }>;
  improvementRoadmap: string[];
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  questionId?: string;
  timestamp: Date;
}

export interface DashboardStats {
  totalInterviews: number;
  avgScore: number;
  totalResumes: number;
  lastActivity: string | null;
}

export interface PerformanceTrend {
  date: string;
  score: number;
  session: string;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: "admin" | "recruiter" | "viewer";
      orgId: string | null;
    };
  }
}
