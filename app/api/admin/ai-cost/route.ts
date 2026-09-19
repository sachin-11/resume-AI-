import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totals, byFeature, bySession] = await Promise.all([
    db.aiUsageLog.aggregate({
      _sum: { costUsd: true, totalTokens: true },
      _count: { id: true },
    }),
    db.aiUsageLog.groupBy({
      by: ["feature"],
      _sum: { costUsd: true, totalTokens: true },
      _count: { id: true },
      orderBy: { _sum: { costUsd: "desc" } },
    }),
    db.aiUsageLog.groupBy({
      by: ["sessionId"],
      where: { sessionId: { not: null } },
      _sum: { costUsd: true, totalTokens: true },
      _count: { id: true },
      orderBy: { _sum: { costUsd: "desc" } },
      take: 10,
    }),
  ]);

  const sessionIds = bySession.map((s) => s.sessionId).filter((id): id is string => !!id);
  const sessions = sessionIds.length
    ? await db.interviewSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, title: true, role: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  return NextResponse.json({
    totalCostUsd: totals._sum.costUsd ?? 0,
    totalTokens: totals._sum.totalTokens ?? 0,
    totalCalls: totals._count.id,
    byFeature: byFeature.map((f) => ({
      feature: f.feature,
      costUsd: f._sum.costUsd ?? 0,
      tokens: f._sum.totalTokens ?? 0,
      calls: f._count.id,
    })),
    topInterviews: bySession.map((s) => {
      const meta = s.sessionId ? sessionMap.get(s.sessionId) : undefined;
      return {
        sessionId: s.sessionId,
        title: meta?.title ?? "Interview",
        role: meta?.role ?? "",
        candidate: meta?.user?.name ?? meta?.user?.email ?? "",
        costUsd: s._sum.costUsd ?? 0,
        tokens: s._sum.totalTokens ?? 0,
        calls: s._count.id,
      };
    }),
  });
}
