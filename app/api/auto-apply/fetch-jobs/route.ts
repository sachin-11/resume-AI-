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
import { searchJobs, formatSalary } from "@/lib/jsearch";
import { analyzeGap } from "@/lib/jobAgent";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Match each job against resume (parallel, max 5 at a time)
  const results = [];
  const BATCH = 5;

  for (let i = 0; i < Math.min(jobs.length, limit); i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        // Check if already saved
        const existing = await db.autoApplyJob.findFirst({
          where: { userId: session.user.id, externalId: job.job_id },
          select: { id: true },
        });
        if (existing) return null;

        // AI match score
        let matchScore = 0;
        let matchedSkills: string[] = [];
        let missingSkills: string[] = [];

        if (resumeText && job.job_description) {
          try {
            const gap = await analyzeGap(resumeText, job.job_description);
            matchScore = gap.matchScore;
            matchedSkills = gap.matchedSkills;
            missingSkills = gap.missingSkills;
          } catch {
            matchScore = 50; // fallback
          }
        }

        // Save to DB
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

  // Update lastRunAt in settings
  await db.autoApplySettings.updateMany({
    where: { userId: session.user.id },
    data: { lastRunAt: new Date() },
  });

  return NextResponse.json({
    found: results.length,
    matched,
    skipped: results.length - matched,
    source,
    jobs: results.filter((r) => r && r.status === "found"),
  });
}
