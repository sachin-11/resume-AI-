/**
 * DB Chat — Natural Language to Database Query
 *
 * Flow:
 * 1. User asks a question in natural language
 * 2. AI understands intent + generates a structured query plan
 * 3. We execute safe Prisma queries based on the plan
 * 4. AI formats the results into a natural language answer
 */

import { callGroq } from "@/lib/groq";
import { db } from "@/lib/db";

// ── Schema context for the AI ────────────────────────────────────
const SCHEMA_CONTEXT = `
You are a database assistant for an AI Interview Platform. You have access to these tables:

TABLES:
- User: id, name, email, plan(free/pro/enterprise), role, interviewsThisMonth, createdAt
- InterviewSession: id, userId, title, role, difficulty, roundType, status(pending/active/completed), totalQuestions, tabSwitchCount, integrityFlag(clean/warning/suspicious), createdAt
- FeedbackReport: id, sessionId, overallScore(0-100), technicalScore, communicationScore, confidenceScore, strengths[], weakAreas[], summary, createdAt
- InterviewCampaign: id, userId, title, role, difficulty, roundType, questionCount, status(active/closed), createdAt
- CandidateInvite: id, campaignId, email, name, status(pending/started/completed/abandoned), emailSent, tabSwitchCount, createdAt
- Resume: id, userId, fileName, createdAt
- QuestionBank: id, userId, text, category, difficulty, tags[], createdAt

RELATIONSHIPS:
- InterviewSession belongs to User (userId)
- FeedbackReport belongs to InterviewSession (sessionId)
- CandidateInvite belongs to InterviewCampaign (campaignId)
- InterviewCampaign belongs to User (userId)

IMPORTANT: You only have access to data for the CURRENT USER (userId is always filtered).
`;

// ── Intent classification ────────────────────────────────────────
const INTENT_SYSTEM = `${SCHEMA_CONTEXT}

Analyze the user's question and return a JSON object describing what data to fetch.
Return ONLY valid JSON, no explanation.

IMPORTANT: Only set dateFrom/dateTo if the user EXPLICITLY mentions a date or time period (e.g., "this month", "last week", "in April"). Otherwise set them to null.

Response format:
{
  "intent": "interviews" | "feedback" | "campaigns" | "candidates" | "resumes" | "stats" | "question_bank" | "unknown",
  "filters": {
    "status": "completed" | "pending" | "active" | null,
    "role": "string or null",
    "difficulty": "beginner" | "intermediate" | "advanced" | null,
    "roundType": "technical" | "hr" | "behavioral" | "system_design" | null,
    "limit": 5,
    "orderBy": "score" | "date" | "name" | null,
    "orderDir": "asc" | "desc",
    "search": "string or null",
    "dateFrom": null,
    "dateTo": null
  },
  "aggregation": "count" | "avg" | "max" | "min" | "list" | null,
  "field": "overallScore" | "technicalScore" | "communicationScore" | null
}`;

// ── Answer generation ────────────────────────────────────────────
const ANSWER_SYSTEM = `${SCHEMA_CONTEXT}

You are a helpful assistant. Given a user question and database results, provide a clear, concise answer.
- Be conversational and friendly
- Format numbers nicely (e.g., "74/100" not "74")
- Use bullet points for lists
- Highlight important insights
- If no data found, say so helpfully
- Keep answers under 200 words unless listing many items`;

// ── Query executor ───────────────────────────────────────────────
async function executeQuery(userId: string, plan: QueryPlan): Promise<unknown> {
  const { intent, filters, aggregation } = plan;
  const limit = Math.min(filters.limit ?? 10, 50);

  switch (intent) {
    case "interviews": {
      const where: Record<string, unknown> = { userId };
      if (filters.status) where.status = filters.status;
      if (filters.role) where.role = { contains: filters.role, mode: "insensitive" };
      if (filters.difficulty) where.difficulty = filters.difficulty;
      if (filters.roundType) where.roundType = filters.roundType;

      // Only add date filter if dates are valid
      const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
      const toDate = filters.dateTo ? new Date(filters.dateTo) : null;
      if (fromDate && !isNaN(fromDate.getTime()) || toDate && !isNaN(toDate.getTime())) {
        where.createdAt = {
          ...(fromDate && !isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
          ...(toDate && !isNaN(toDate.getTime()) ? { lte: toDate } : {}),
        };
      }

      if (aggregation === "count") {
        return { count: await db.interviewSession.count({ where }) };
      }

      const sessions = await db.interviewSession.findMany({
        where,
        orderBy: filters.orderBy === "score"
          ? { feedbackReport: { overallScore: filters.orderDir ?? "desc" } }
          : { createdAt: filters.orderDir ?? "desc" },
        take: limit,
        include: { feedbackReport: { select: { overallScore: true, technicalScore: true, communicationScore: true } } },
      });

      if (aggregation === "avg") {
        const scores = sessions.map((s) => s.feedbackReport?.overallScore).filter(Boolean) as number[];
        return { avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, count: scores.length };
      }
      if (aggregation === "max") {
        const scores = sessions.map((s) => s.feedbackReport?.overallScore).filter(Boolean) as number[];
        return { max: scores.length ? Math.max(...scores) : null };
      }

      return sessions.map((s) => ({
        title: s.title,
        role: s.role,
        difficulty: s.difficulty,
        roundType: s.roundType,
        status: s.status,
        score: s.feedbackReport?.overallScore ?? null,
        date: s.createdAt.toLocaleDateString("en-IN"),
        integrityFlag: s.integrityFlag,
      }));
    }

    case "feedback": {
      const where: Record<string, unknown> = { session: { userId } };
      if (filters.role) where.session = { userId, role: { contains: filters.role, mode: "insensitive" } };

      if (aggregation === "avg") {
        const reports = await db.feedbackReport.findMany({ where, select: { overallScore: true, technicalScore: true, communicationScore: true, confidenceScore: true } });
        if (!reports.length) return { avg: null };
        const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
        return {
          avgOverall: avg(reports.map((r) => r.overallScore)),
          avgTechnical: avg(reports.map((r) => r.technicalScore)),
          avgCommunication: avg(reports.map((r) => r.communicationScore)),
          avgConfidence: avg(reports.map((r) => r.confidenceScore)),
          count: reports.length,
        };
      }

      const reports = await db.feedbackReport.findMany({
        where,
        orderBy: { overallScore: filters.orderDir ?? "desc" },
        take: limit,
        include: { session: { select: { title: true, role: true, difficulty: true, createdAt: true } } },
      });

      return reports.map((r) => ({
        role: r.session?.role,
        title: r.session?.title,
        overallScore: r.overallScore,
        technicalScore: r.technicalScore,
        communicationScore: r.communicationScore,
        confidenceScore: r.confidenceScore,
        summary: r.summary,
        strengths: r.strengths.slice(0, 2),
        weakAreas: r.weakAreas.slice(0, 2),
        date: r.session?.createdAt.toLocaleDateString("en-IN"),
      }));
    }

    case "campaigns": {
      const where: Record<string, unknown> = { userId };
      if (filters.status) where.status = filters.status;
      if (filters.role) where.role = { contains: filters.role, mode: "insensitive" };

      if (aggregation === "count") {
        return { count: await db.interviewCampaign.count({ where }) };
      }

      const campaigns = await db.interviewCampaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          _count: { select: { invites: true } },
          invites: { select: { status: true } },
        },
      });

      return campaigns.map((c) => ({
        title: c.title,
        role: c.role,
        difficulty: c.difficulty,
        status: c.status,
        totalInvited: c._count.invites,
        completed: c.invites.filter((i) => i.status === "completed").length,
        pending: c.invites.filter((i) => i.status === "pending").length,
        date: c.createdAt.toLocaleDateString("en-IN"),
      }));
    }

    case "candidates": {
      const where: Record<string, unknown> = { campaign: { userId } };
      if (filters.status) where.status = filters.status;
      if (filters.search) where.email = { contains: filters.search, mode: "insensitive" };

      if (aggregation === "count") {
        return { count: await db.candidateInvite.count({ where }) };
      }

      const invites = await db.candidateInvite.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { campaign: { select: { title: true, role: true } } },
      });

      // Fetch scores
      const withScores = await Promise.all(invites.map(async (inv) => {
        let score = null;
        if (inv.sessionId) {
          const fb = await db.feedbackReport.findUnique({ where: { sessionId: inv.sessionId }, select: { overallScore: true } });
          score = fb?.overallScore ?? null;
        }
        return {
          name: inv.name || inv.email,
          email: inv.email,
          campaign: inv.campaign?.title,
          role: inv.campaign?.role,
          status: inv.status,
          score,
          date: inv.createdAt.toLocaleDateString("en-IN"),
        };
      }));

      return withScores;
    }

    case "resumes": {
      if (aggregation === "count") {
        return { count: await db.resume.count({ where: { userId } }) };
      }
      const resumes = await db.resume.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { fileName: true, fileType: true, createdAt: true },
      });
      return resumes.map((r) => ({ name: r.fileName, type: r.fileType, date: r.createdAt.toLocaleDateString("en-IN") }));
    }

    case "stats": {
      const [totalInterviews, totalResumes, totalCampaigns, feedbackReports] = await Promise.all([
        db.interviewSession.count({ where: { userId } }),
        db.resume.count({ where: { userId } }),
        db.interviewCampaign.count({ where: { userId } }),
        db.feedbackReport.findMany({
          where: { session: { userId } },
          select: { overallScore: true },
        }),
      ]);
      const scores = feedbackReports.map((r) => r.overallScore);
      return {
        totalInterviews,
        totalResumes,
        totalCampaigns,
        avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        bestScore: scores.length ? Math.max(...scores) : null,
        completedInterviews: await db.interviewSession.count({ where: { userId, status: "completed" } }),
      };
    }

    case "question_bank": {
      if (aggregation === "count") {
        return { count: await db.questionBank.count({ where: { userId } }) };
      }
      const questions = await db.questionBank.findMany({
        where: { userId, ...(filters.search ? { text: { contains: filters.search, mode: "insensitive" } } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { text: true, category: true, difficulty: true, tags: true },
      });
      return questions;
    }

    default:
      return null;
  }
}

interface QueryPlan {
  intent: string;
  filters: {
    status?: string;
    role?: string;
    difficulty?: string;
    roundType?: string;
    limit?: number;
    orderBy?: string;
    orderDir?: "asc" | "desc";
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  aggregation?: string;
  field?: string;
}

// ── Main chat function ───────────────────────────────────────────
export async function dbChat(
  userId: string,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  try {
    // Step 1: Understand intent
    const intentRaw = await callGroq(
      INTENT_SYSTEM,
      `User question: "${question}"\n\nReturn the query plan JSON.`,
      "llama-3.3-70b-versatile"
    );

    let plan: QueryPlan;
    try {
      const jsonMatch = intentRaw.match(/\{[\s\S]*\}/);
      plan = JSON.parse(jsonMatch?.[0] ?? intentRaw);
    } catch {
      return "I couldn't understand that question. Try asking something like:\n- \"Show my recent interviews\"\n- \"What's my average score?\"\n- \"List all campaigns\"";
    }

    if (plan.intent === "unknown") {
      return "I can help you with information about your interviews, feedback scores, campaigns, candidates, and resumes. What would you like to know?";
    }

    // Step 2: Execute query
    const data = await executeQuery(userId, plan);

    if (!data) {
      return "No data found for your query. Try a different question.";
    }

    // Step 3: Generate natural language answer
    const historyContext = history.slice(-4).map((h) => `${h.role}: ${h.content}`).join("\n");

    const answer = await callGroq(
      ANSWER_SYSTEM,
      `Previous conversation:\n${historyContext}\n\nUser question: "${question}"\n\nDatabase results:\n${JSON.stringify(data, null, 2)}\n\nProvide a helpful, conversational answer based on the data.`,
      "llama-3.3-70b-versatile"
    );

    return answer;
  } catch (err) {
    console.error("[DB_CHAT]", err);
    return "Sorry, I encountered an error. Please try again.";
  }
}
