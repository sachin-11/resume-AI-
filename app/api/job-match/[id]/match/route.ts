/**
 * POST /api/job-match/[id]/match
 *
 * Runs AI matching for all user resumes against the given JD.
 * Saves results to DB and returns ranked candidates.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchAllResumes } from "@/lib/resumeMatcher";

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
  });
  if (!jd) return NextResponse.json({ error: "Job description not found" }, { status: 404 });

  // Fetch all user resumes
  const resumes = await db.resume.findMany({
    where: { userId: session.user.id },
    select: { id: true, rawText: true, fileName: true },
  });

  if (resumes.length === 0) {
    return NextResponse.json({ error: "No resumes found. Upload resumes first." }, { status: 400 });
  }

  // Run AI matching
  const results = await matchAllResumes(
    resumes.map((r) => ({ id: r.id, rawText: r.rawText })),
    jd.description
  );

  // Upsert results into DB
  await Promise.all(
    results.map((r) =>
      db.resumeMatch.upsert({
        where: { jobDescriptionId_resumeId: { jobDescriptionId: jdId, resumeId: r.resumeId } },
        create: {
          jobDescriptionId: jdId,
          resumeId: r.resumeId,
          score: r.score,
          matchedSkills: r.matchedSkills,
          missingSkills: r.missingSkills,
          summary: r.summary,
          recommendation: r.recommendation,
        },
        update: {
          score: r.score,
          matchedSkills: r.matchedSkills,
          missingSkills: r.missingSkills,
          summary: r.summary,
          recommendation: r.recommendation,
        },
      })
    )
  );

  // Return ranked results with resume file names
  const resumeMap = Object.fromEntries(resumes.map((r) => [r.id, r.fileName]));
  const ranked = results.map((r, idx) => ({
    rank: idx + 1,
    resumeId: r.resumeId,
    fileName: resumeMap[r.resumeId] ?? "Unknown",
    score: r.score,
    matchedSkills: r.matchedSkills,
    missingSkills: r.missingSkills,
    summary: r.summary,
    recommendation: r.recommendation,
  }));

  return NextResponse.json({ ranked, total: ranked.length });
}
