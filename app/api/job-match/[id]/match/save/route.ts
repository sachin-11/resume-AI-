/**
 * POST /api/job-match/[id]/match/save   Body: { jobId }
 *
 * Stores a finished bulk-screening job's results in ResumeMatch. The result is
 * read server-side from agent-service (only the submitting user can read it),
 * and must belong to this JD and to this user's resumes — the browser never
 * supplies scores itself. Idempotent: saving the same job twice is harmless.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentHeaders } from "@/lib/agentAuth";
import { AGENT_URL } from "@/lib/copilot-agent";
import { toRanked, toRecommendation } from "@/lib/bulkScreening";

const schema = z.object({ jobId: z.string().regex(/^[a-f0-9]{32}$/) });

interface ScreeningResult {
  resume_id: string;
  rating: number;
  decision: string;
  matched_skills: string[];
  missing_skills: string[];
  reasons: string[];
  red_flags: string[];
  review_reasons: string[];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const { id: jdId } = await params;
  const jd = await db.jobDescription.findFirst({ where: { id: jdId, userId: session.user.id }, select: { id: true } });
  if (!jd) return NextResponse.json({ error: "Job description not found" }, { status: 404 });

  const res = await fetch(`${AGENT_URL}/jobs/${parsed.data.jobId}`, {
    headers: await agentHeaders(session.user),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Screening job not found" }, { status: 404 });
  const job = await res.json();
  if (job.agent !== "bulk-screening" || job.status !== "succeeded" || job.result?.report?.reference_id !== jdId) {
    return NextResponse.json({ error: "That job isn't a finished screening for this job description" }, { status: 400 });
  }

  const results: ScreeningResult[] = job.result.report.results ?? [];
  const owned = await db.resume.findMany({
    where: { id: { in: results.map((r) => r.resume_id) }, userId: session.user.id },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((r) => r.id));
  const rows = results.filter((r) => ownedIds.has(r.resume_id));

  await db.$transaction(
    rows.map((r) => {
      const score = Math.max(0, Math.min(100, Math.round(r.rating)));
      const data = {
        score,
        matchedSkills: r.matched_skills.slice(0, 30),
        missingSkills: r.missing_skills.slice(0, 30),
        summary: [...r.reasons, ...r.red_flags.map((f) => `⚠ ${f}`)].join(" · ").slice(0, 2000),
        recommendation: toRecommendation(r.decision, score),
        reviewReasons: r.review_reasons.slice(0, 10),
      };
      return db.resumeMatch.upsert({
        where: { jobDescriptionId_resumeId: { jobDescriptionId: jdId, resumeId: r.resume_id } },
        create: { jobDescriptionId: jdId, resumeId: r.resume_id, ...data },
        update: data,
      });
    }),
  );

  const saved = await db.resumeMatch.findMany({
    where: { jobDescriptionId: jdId },
    include: { resume: { select: { fileName: true } } },
  });
  return NextResponse.json({ ranked: toRanked(saved), total: saved.length });
}
