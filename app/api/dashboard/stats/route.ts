import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const [totalInterviews, totalResumes, feedbackReports, lastSession] = await Promise.all([
      db.interviewSession.count({ where: { userId } }),
      db.resume.count({ where: { userId } }),
      db.feedbackReport.findMany({
        where: { session: { userId } },
        select: { overallScore: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.interviewSession.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const avgScore =
      feedbackReports.length > 0
        ? Math.round(
            feedbackReports.reduce((sum, r) => sum + r.overallScore, 0) /
              feedbackReports.length
          )
        : 0;

    const trends = feedbackReports
      .slice()
      .reverse()
      .map((r) => ({
        date: r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: r.overallScore,
      }));

    return NextResponse.json({
      stats: {
        totalInterviews,
        avgScore,
        totalResumes,
        lastActivity: lastSession?.createdAt ?? null,
      },
      trends,
    });
  } catch (err) {
    console.error("[DASHBOARD_STATS]", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
