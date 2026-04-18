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

    const userId = session.user.id;
    const { searchParams } = req.nextUrl;

    // Date range filter
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const dateFilter = from && to ? {
      createdAt: { gte: new Date(from), lte: new Date(to + "T23:59:59.999Z") }
    } : {};

    const [totalInterviews, totalResumes, feedbackReports, lastSession, campaigns] =
      await Promise.all([
        db.interviewSession.count({ where: { userId, ...dateFilter } }),
        db.resume.count({ where: { userId } }),
        db.feedbackReport.findMany({
          where: { session: { userId, ...dateFilter } },
          select: {
            overallScore: true, technicalScore: true,
            communicationScore: true, confidenceScore: true,
            createdAt: true,
            session: { select: { role: true, difficulty: true, roundType: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        db.interviewSession.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        // Campaign pass/fail stats
        db.interviewCampaign.findMany({
          where: { userId },
          select: {
            id: true, title: true, role: true, difficulty: true,
            invites: {
              where: { status: "completed" },
              select: { sessionId: true },
            },
          },
        }),
      ]);

    const avgScore =
      feedbackReports.length > 0
        ? Math.round(feedbackReports.reduce((s, r) => s + r.overallScore, 0) / feedbackReports.length)
        : 0;

    // ── Score trends over time ───────────────────────────────
    const trends = feedbackReports.map((r) => ({
      date: r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: r.overallScore,
      technical: r.technicalScore,
      communication: r.communicationScore,
      confidence: r.confidenceScore,
    }));

    // ── Avg score by role ────────────────────────────────────
    const roleMap: Record<string, number[]> = {};
    for (const r of feedbackReports) {
      const role = r.session?.role ?? "Unknown";
      if (!roleMap[role]) roleMap[role] = [];
      roleMap[role].push(r.overallScore);
    }
    const byRole = Object.entries(roleMap).map(([role, scores]) => ({
      role: role.length > 20 ? role.slice(0, 18) + "…" : role,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    })).sort((a, b) => b.avg - a.avg);

    // ── Avg score by difficulty ──────────────────────────────
    const diffMap: Record<string, number[]> = {};
    for (const r of feedbackReports) {
      const diff = r.session?.difficulty ?? "unknown";
      if (!diffMap[diff]) diffMap[diff] = [];
      diffMap[diff].push(r.overallScore);
    }
    const byDifficulty = Object.entries(diffMap).map(([difficulty, scores]) => ({
      difficulty,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    }));

    // ── Pass/fail rate per campaign — single query, no N+1 ──
    const PASS_THRESHOLD = 60;
    const campaignSessionIds = campaigns.flatMap((c) =>
      c.invites.map((i) => i.sessionId).filter(Boolean) as string[]
    );

    const allCampaignReports = campaignSessionIds.length > 0
      ? await db.feedbackReport.findMany({
          where: { sessionId: { in: campaignSessionIds } },
          select: { sessionId: true, overallScore: true },
        })
      : [];

    const reportBySession = new Map(allCampaignReports.map((r) => [r.sessionId, r.overallScore]));

    const campaignStats = campaigns.map((c) => {
      const sessionIds = c.invites.map((i) => i.sessionId).filter(Boolean) as string[];
      const scores = sessionIds.map((id) => reportBySession.get(id)).filter((s): s is number => s !== undefined);
      if (scores.length === 0) return null;

      const pass = scores.filter((s) => s >= PASS_THRESHOLD).length;
      return {
        name: c.title.length > 18 ? c.title.slice(0, 16) + "…" : c.title,
        role: c.role,
        pass,
        fail: scores.length - pass,
        avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        total: scores.length,
      };
    }).filter(Boolean);

    // ── Best performing candidates ───────────────────────────
    const topCandidates = await db.feedbackReport.findMany({
      where: { session: { userId } },
      orderBy: { overallScore: "desc" },
      take: 5,
      select: {
        overallScore: true, technicalScore: true,
        communicationScore: true, createdAt: true,
        session: { select: { title: true, role: true, difficulty: true } },
      },
    });

    return NextResponse.json({
      stats: { totalInterviews, avgScore, totalResumes, lastActivity: lastSession?.createdAt ?? null },
      trends,
      byRole,
      byDifficulty,
      campaignStats: campaignStats,
      topCandidates: topCandidates.map((r) => ({
        title: r.session?.title ?? "Interview",
        role: r.session?.role ?? "",
        difficulty: r.session?.difficulty ?? "",
        overallScore: r.overallScore,
        technicalScore: r.technicalScore,
        communicationScore: r.communicationScore,
        date: r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })),
    });
  } catch (err) {
    console.error("[DASHBOARD_STATS]", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
