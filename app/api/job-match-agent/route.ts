/**
 * POST /api/job-match-agent
 *
 * Runs the LangGraph Job Match Agent:
 *   parse_jd → deep_match → mock_interview → salary_insight → strategy → build_report
 *
 * Body: { resumeId, jobTitle, company?, jobDescription }
 * Returns: full deep-match report
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  resumeId:       z.string().min(1),
  jobTitle:       z.string().min(1).max(200),
  company:        z.string().max(100).optional(),
  jobDescription: z.string().min(50, "Job description must be at least 50 characters"),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { resumeId, jobTitle, company, jobDescription } = parsed.data;

  // Fetch resume
  const resume = await db.resume.findFirst({
    where: { id: resumeId, userId: session.user.id },
    select: { id: true, rawText: true, fileName: true },
  });
  if (!resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  const AGENT_URL    = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
  const AGENT_SECRET = process.env.AGENT_SECRET      ?? "dev-secret-change-in-production";

  if (!process.env.AGENT_SERVICE_URL) {
    return NextResponse.json({
      error: "Agent service not configured. Set AGENT_SERVICE_URL in .env",
      agentNotConfigured: true,
    }, { status: 503 });
  }

  try {
    const agentRes = await fetch(`${AGENT_URL}/job-match-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-secret": AGENT_SECRET,
      },
      body: JSON.stringify({
        resume_text:     resume.rawText,
        job_description: jobDescription,
        resume_id:       resume.id,
        user_id:         session.user.id,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!agentRes.ok) {
      const err = await agentRes.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? `Agent returned ${agentRes.status}`);
    }

    const agentData = await agentRes.json() as { report: Record<string, unknown>; logs: string[] };
    const report    = agentData.report;

    // Persist as a JobApplication so the user can revisit later
    const app = await db.jobApplication.create({
      data: {
        userId:          session.user.id,
        resumeId:        resume.id,
        jobTitle,
        company:         company ?? null,
        jobDescription,
        resumeGapAnalysis: report as object,
        status:          "draft",
      },
    });

    return NextResponse.json({
      success:       true,
      applicationId: app.id,
      report,
      logs: agentData.logs,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Agent service failed";
    console.error("[JOB_MATCH_AGENT]", msg);

    if (msg.includes("fetch") || msg.includes("ECONNREFUSED")) {
      return NextResponse.json({
        error:     "Agent service is not running. Start it with: cd agent-service && uvicorn main:app --reload",
        agentDown: true,
      }, { status: 503 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
