/**
 * GET /api/job-match/[id]/results
 * Returns previously saved match results for a JD, ranked by score.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toRanked } from "@/lib/bulkScreening";

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
    include: { resume: { select: { fileName: true, createdAt: true } } },
  });
  const ranked = toRanked(matches);

  return NextResponse.json({ jobDescription: jd, ranked });
}
