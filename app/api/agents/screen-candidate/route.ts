/**
 * POST /api/agents/screen-candidate
 * Runs candidate screening agent with GitHub verification
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
  const AGENT_SECRET = process.env.AGENT_SECRET ?? "dev-secret-change-in-production";

  const { resumeId, jobDescription, candidateName, candidateEmail, githubUsername } = await req.json();

  const resume = await db.resume.findFirst({
    where: { id: resumeId, userId: session.user.id },
    select: { rawText: true },
  });
  if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

  try {
    const res = await fetch(`${AGENT_URL}/screen-candidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agent-secret": AGENT_SECRET },
      body: JSON.stringify({
        resume_text: resume.rawText,
        job_description: jobDescription,
        candidate_name: candidateName ?? "",
        candidate_email: candidateEmail ?? "",
        github_username: githubUsername ?? null,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent failed" }, { status: 500 });
  }
}
