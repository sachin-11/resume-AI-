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

    // Fetch jobs from JSearch
    const { jobs, source } = await searchJobs({
      query: targetRole,
      location: location ?? "India",
      numPages: Math.ceil(limit / 10),
      datePosted: "week",
    });

    if (jobs.length === 0) {
      return NextResponse.json({ found: 0, matched: 0, source });
    }

    // Match each job against resume (parallel, max 3 at a time to avoid rate limits)
    const results = [];
    const BATCH = 3;

    for (let i = 0; i < Math.min(jobs.length, limit); i += BATCH) {
      const batch = jobs.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (job) => {
          // Skip duplicates
          const existing = await db.autoApplyJob.findFirst({
            where: { userId: session.user.id, externalId: job.job_id },
            select: { id: true },
          });
          if (existing) return null;

          let matchScore = 0;
          let matchedSkills: string[] = [];
          let missingSkills: string[] = [];

          if (resumeText && job.job_description) {
            // AI-powered match when resume is available
            try {
              const gap = await analyzeGap(resumeText, job.job_description);
              matchScore = gap.matchScore;
              matchedSkills = gap.matchedSkills;
              missingSkills = gap.missingSkills;
            } catch {
              matchScore = basicTitleScore(job.job_title, targetRole);
            }
          } else {
            // No resume — use keyword-based title score so jobs still appear
            matchScore = basicTitleScore(job.job_title, targetRole);
            matchedSkills = job.job_required_skills?.slice(0, 5) ?? [];
          }

          const saved = await db.autoApplyJob.create({
            data: {
              userId: session.user.id,
              resumeId: resumeId ?? null,
              jobTitle: job.job_title,
              company: job.employer_name,
              location: [job.job_city, job.job_country].filter(Boolean).join(", "),
              jobUrl: job.job_apply_link,
              jobDescription: job.job_description?.slice(0, 5000) ?? "",
              salary: formatSalary(job),
              jobType: job.job_employment_type,
              source: "jsearch",
              externalId: job.job_id,
              matchScore,
              matchedSkills,
              missingSkills,
              status: matchScore >= minMatchScore ? "found" : "skipped",
            },
          });

          return { ...saved, isNew: true };
        })
      );
      results.push(...batchResults.filter(Boolean));
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
      source,
      jobs: results.filter((r) => r && r.status === "found"),
    });
  } catch (err) {
    console.error("[FETCH_JOBS]", err);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}
