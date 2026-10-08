/**
 * POST /api/job-match/[id]/match
 *
 * Queues AI screening of the recruiter's resumes (most recent ≤ 50) against this
 * JD on agent-service and returns { jobId }. The browser polls
 * /api/agent-jobs/[jobId], then calls /api/job-match/[id]/match/save to store
 * the ranked results.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitAgentJob } from "@/lib/agentJobs";
import { BULK_SCREENING_MAX } from "@/lib/bulkScreening";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jdId } = await params;

  // Verify JD belongs to user
  const jd = await db.jobDescription.findFirst({
    where: { id: jdId, userId: session.user.id },
    select: { description: true },
  });
  if (!jd) return NextResponse.json({ error: "Job description not found" }, { status: 404 });

  const resumes = await db.resume.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: BULK_SCREENING_MAX,
    select: { id: true, rawText: true },
  });
  const usable = resumes.filter((r) => (r.rawText ?? "").trim().length >= 30);
  if (usable.length === 0) {
    return NextResponse.json({ error: "No resumes found. Upload resumes first." }, { status: 400 });
  }

  return submitAgentJob(session.user, "bulk-screening", {
    job_description: jd.description.slice(0, 8000),
    reference_id: jdId,
    resumes: usable.map((r) => ({ id: r.id, text: r.rawText.slice(0, 20000) })),
  });
}
