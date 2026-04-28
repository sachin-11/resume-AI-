/**
 * GET /api/job-match/[id]/results
 * Returns previously saved match results for a JD, ranked by score.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jdId } = await params;

  const jd = await db.jobDescription.findFirst({
    where: { id: jdId, userId: session.user.id },
  });
  if (!jd) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const matches = await db.resumeMatch.findMany({
    where: { jobDescriptionId: jdId },
    orderBy: { score: "desc" },
    include: { resume: { select: { fileName: true, createdAt: true } } },
  });

  const ranked = matches.map((m, idx) => ({
    rank: idx + 1,
    resumeId: m.resumeId,
    fileName: m.resume.fileName,
    score: m.score,
    matchedSkills: m.matchedSkills,
    missingSkills: m.missingSkills,
    summary: m.summary,
    recommendation: m.recommendation,
    analyzedAt: m.createdAt,
  }));

  return NextResponse.json({ jobDescription: jd, ranked });
}
