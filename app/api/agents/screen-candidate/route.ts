/**
 * POST /api/agents/screen-candidate
 * Queues the candidate screening agent (with GitHub verification) as a background
 * job and returns { jobId } — poll /api/agent-jobs/[id] for progress and the report.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitAgentJob } from "@/lib/agentJobs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { resumeId, jobDescription, candidateName, candidateEmail, githubUsername } = await req.json();

  const resume = await db.resume.findFirst({
    where: { id: resumeId, userId: session.user.id },
    select: { rawText: true },
  });
  if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

  return submitAgentJob(session.user, "screen-candidate", {
    resume_text: resume.rawText,
    job_description: jobDescription,
    candidate_name: candidateName ?? "",
    candidate_email: candidateEmail ?? "",
    github_username: githubUsername ?? null,
  });
}
