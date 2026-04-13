export interface ResumeAnalysis {
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
}

export interface GeneratedQuestion {
  text: string;
  type: "main" | "followup";
  hint?: string;
  orderIndex: number;
}

export interface FeedbackReport {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
  strengths: string[];
  weakAreas: string[];
  betterAnswers: Array<{ question: string; improvedAnswer: string }>;
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
    };
  }
}
