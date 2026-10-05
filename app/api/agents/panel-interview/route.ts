/**
 * POST /api/agents/panel-interview
 * 3-agent panel evaluation (Technical + HR + Domain, run in parallel), queued as a
 * background job — returns { jobId }; poll /api/agent-jobs/[id] for progress and the report.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitAgentJob } from "@/lib/agentJobs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId, resumeId } = await req.json();

  // Fetch interview session with Q&A
  const interviewSession = await db.interviewSession.findFirst({
    where: { id: sessionId, userId: session.user.id },
    include: {
      questions: {
        include: { answers: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
  if (!interviewSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Build Q&A pairs
  const qaPairs = interviewSession.questions
    .filter((q) => q.answers.length > 0)
    .map((q) => ({ question: q.text, answer: q.answers[0].text }));

  if (qaPairs.length === 0) return NextResponse.json({ error: "No answers found in this session" }, { status: 400 });

  // Fetch resume text if available
  let resumeText = "";
  const rid = resumeId ?? interviewSession.resumeId;
  if (rid) {
    const resume = await db.resume.findFirst({
      where: { id: rid, userId: session.user.id },
      select: { rawText: true },
    });
    resumeText = resume?.rawText ?? "";
  }

  return submitAgentJob(session.user, "panel-interview", {
    resume_text: resumeText,
    role: interviewSession.role,
    qa_pairs: qaPairs,
  });
}
