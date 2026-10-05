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
import { logAgentUsage } from "@/lib/agentUsage";
import { agentHeaders } from "@/lib/agentAuth";

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

    const agentRes = await fetch(`${AGENT_URL}/auto-apply`, {
      method: "POST",
      headers: await agentHeaders(session.user),
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
    logAgentUsage(agentData.usage, { userId: session.user.id, feature: "agent:auto-apply" });
    const agentJobs = agentData.found_jobs ?? [];

    if (agentJobs.length === 0) {
      // Tell the user why (no search source configured / search failed / no matches)
      // instead of a silent "0 jobs".
      return NextResponse.json({
        found: 0, matched: 0, skipped: 0,
        source: agentData.search_status ?? "none",
        message: agentData.search_message || "No new jobs found.",
      });
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
          source: job.source ?? "unknown",   // jsearch | brave-search
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
      source: "live",
      jobs: results.filter((r) => r && r.status === "found"),
    });
  } catch (err) {
    console.error("[FETCH_JOBS]", err);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}
