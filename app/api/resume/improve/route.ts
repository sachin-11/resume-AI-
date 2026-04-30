/**
 * POST /api/resume/improve
 *
 * Calls the Python LangGraph microservice to improve a resume.
 * The agent iteratively rewrites weak sections until ATS score >= 70.
 *
 * Body: { resumeId, targetRole?, jobDescription? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
const AGENT_SECRET = process.env.AGENT_SECRET ?? "dev-secret-change-in-production";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { resumeId, targetRole, jobDescription } = await req.json();
  if (!resumeId) {
    return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
  }

  // Fetch resume from DB
  const resume = await db.resume.findFirst({
    where: { id: resumeId, userId: session.user.id },
    select: { id: true, rawText: true, fileName: true },
  });
  if (!resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  // Check if agent service is configured
  if (!process.env.AGENT_SERVICE_URL) {
    return NextResponse.json({
      error: "Agent service not configured. Set AGENT_SERVICE_URL in .env",
      agentNotConfigured: true,
    }, { status: 503 });
  }

  try {
    // Call Python LangGraph microservice
    const agentRes = await fetch(`${AGENT_URL}/improve-resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-secret": AGENT_SECRET,
      },
      body: JSON.stringify({
        resume_text:     resume.rawText,
        resume_id:       resume.id,
        user_id:         session.user.id,
        target_role:     targetRole ?? null,
        job_description: jobDescription ?? null,
        max_iterations:  3,
      }),
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    if (!agentRes.ok) {
      const err = await agentRes.json().catch(() => ({}));
      throw new Error(err.detail ?? `Agent returned ${agentRes.status}`);
    }

    const agentData = await agentRes.json();
    const report = agentData.report;

    // Save improvement report to DB
    await db.resume.update({
      where: { id: resumeId },
      data: {
        analysisReport: {
          ...(resume as { analysisReport?: object }).analysisReport ?? {},
          improvementReport: report,
        } as object,
      },
    });

    return NextResponse.json({
      success: true,
      report,
      logs: agentData.logs,
      originalText: resume.rawText,  // for client-side PDF generation
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Agent service failed";
    console.error("[RESUME_IMPROVE]", msg);

    // If agent service is down, return helpful error
    if (msg.includes("fetch") || msg.includes("ECONNREFUSED")) {
      return NextResponse.json({
        error: "Agent service is not running. Start it with: cd agent-service && uvicorn main:app --reload",
        agentDown: true,
      }, { status: 503 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
