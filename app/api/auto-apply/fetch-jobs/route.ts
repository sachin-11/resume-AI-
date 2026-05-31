/**
 * POST /api/auto-apply/fetch-jobs
 *
 * Fetches jobs from JSearch API, matches against resume, saves to DB.
 * This is the core "scrape + match" pipeline.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { searchJobs, formatSalary } from "@/lib/jsearch";
import { analyzeGap } from "@/lib/jobAgent";

// Basic keyword score when no resume is available
function basicTitleScore(jobTitle: string, targetRole: string): number {
  const jt = jobTitle.toLowerCase();
  const keywords = targetRole.toLowerCase().split(/\s+/).filter((k) => k.length > 2);
  const hits = keywords.filter((k) => jt.includes(k)).length;
  if (hits === 0) return 55;
  return Math.min(60 + hits * 8, 82);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Rate limit by userId — JSearch is a paid API (costs money per call)
    const limited = checkRateLimit(`fj:${session.user.id}`, RATE_LIMITS.fetchJobs);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const { resumeId, targetRole, location, minMatchScore = 65, limit = 10 } = body;

    if (!targetRole) return NextResponse.json({ error: "targetRole required" }, { status: 400 });

    // Fetch resume text
    let resumeText = "";
    if (resumeId) {
      const resume = await db.resume.findFirst({
        where: { id: resumeId, userId: session.user.id },
        select: { rawText: true },
      });
      resumeText = resume?.rawText ?? "";
    }

    // 🚀 Call Python LangGraph Auto Apply Agent!
    const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
    const AGENT_SECRET = process.env.AGENT_SECRET ?? "dev-secret-change-in-production";

    const agentRes = await fetch(`${AGENT_URL}/auto-apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agent-secret": AGENT_SECRET },
      body: JSON.stringify({
        resume_text: resumeText || "Basic developer profile with React and Node.js skills.",
        target_role: targetRole,
        location: location ?? "India",
        min_match_score: minMatchScore,
        limit: Number(limit)
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!agentRes.ok) {
      throw new Error(`FastAPI Agent returned status ${agentRes.status}`);
    }

    const agentData = await agentRes.json();
    const agentJobs = agentData.found_jobs ?? [];

    if (agentJobs.length === 0) {
      return NextResponse.json({ found: 0, matched: 0, source: "mcp-agent" });
    }

    // Save fetched jobs to Prisma PostgreSQL Database
    const results = [];
    for (const job of agentJobs) {
      // Avoid duplicate listings
      const existing = await db.autoApplyJob.findFirst({
        where: { userId: session.user.id, jobUrl: job.jobUrl },
        select: { id: true },
      });
      if (existing) continue;

      const saved = await db.autoApplyJob.create({
        data: {
          userId: session.user.id,
          resumeId: resumeId ?? null,
          jobTitle: job.jobTitle,
          company: job.company,
          location: job.location,
          jobUrl: job.jobUrl,
          jobDescription: job.description?.slice(0, 5000) ?? "",
          salary: job.salary ?? "Not disclosed",
          jobType: job.jobType ?? "Full-time",
          source: "mcp-agent",
          externalId: job.jobUrl ?? String(Math.random()),
          matchScore: job.matchScore,
          matchedSkills: job.matchedSkills,
          missingSkills: job.missingSkills,
          status: job.status,
        },
      });
      results.push({ ...saved, isNew: true });
    }

    const matched = results.filter((r) => r && r.status === "found").length;

    // Update lastRunAt in settings (ignore if no settings row yet)
    await db.autoApplySettings.updateMany({
      where: { userId: session.user.id },
      data: { lastRunAt: new Date() },
    }).catch(() => null);

    return NextResponse.json({
      found: results.length,
      matched,
      skipped: results.length - matched,
      source: "mcp-agent",
      jobs: results.filter((r) => r && r.status === "found"),
    });
  } catch (err) {
    console.error("[FETCH_JOBS]", err);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}
