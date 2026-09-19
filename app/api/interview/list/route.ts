import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = 20;
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      db.interviewSession.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          feedbackReport: { select: { overallScore: true } },
          _count: { select: { questions: true } },
        },
      }),
      db.interviewSession.count({ where: { userId: session.user.id } }),
    ]);

    // Admin-only: attach per-interview AI cost (token spend) for visibility.
    let sessionsWithCost: Array<(typeof sessions)[number] & { aiCostUsd?: number }> = sessions;
    if (session.user.role === "admin" && sessions.length > 0) {
      const costs = await db.aiUsageLog.groupBy({
        by: ["sessionId"],
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        _sum: { costUsd: true },
      });
      const costMap = new Map(costs.map((c) => [c.sessionId, c._sum.costUsd ?? 0]));
      sessionsWithCost = sessions.map((s) => ({ ...s, aiCostUsd: costMap.get(s.id) ?? 0 }));
    }

    return NextResponse.json({ sessions: sessionsWithCost, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[INTERVIEW_LIST]", err);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
