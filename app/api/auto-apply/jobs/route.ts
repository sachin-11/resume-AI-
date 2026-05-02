/**
 * GET  /api/auto-apply/jobs  — list all auto-apply jobs
 * PATCH /api/auto-apply/jobs — bulk status update
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const jobs = await db.autoApplyJob.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
    },
    orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  // Stats
  const stats = await db.autoApplyJob.groupBy({
    by: ["status"],
    where: { userId: session.user.id },
    _count: true,
  });

  const statsMap = Object.fromEntries(stats.map((s) => [s.status, s._count]));

  return NextResponse.json({ jobs, stats: statsMap });
}
