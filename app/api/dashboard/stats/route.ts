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

    const [totalInterviews, totalResumes, feedbackReports, lastSession, campaigns] =
      await Promise.all([
        db.interviewSession.count({ where: { userId } }),
        db.resume.count({ where: { userId } }),
        db.feedbackReport.findMany({
          where: { session: { userId } },
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

    // ── Pass/fail rate per campaign ──────────────────────────
    const PASS_THRESHOLD = 60;
    const campaignStats = await Promise.all(
      campaigns.map(async (c) => {
        const sessionIds = c.invites.map((i) => i.sessionId).filter(Boolean) as string[];
        if (sessionIds.length === 0) return null;

        const reports = await db.feedbackReport.findMany({
          where: { sessionId: { in: sessionIds } },
          select: { overallScore: true },
        });

        const pass = reports.filter((r) => r.overallScore >= PASS_THRESHOLD).length;
        const fail = reports.length - pass;
        const avg = reports.length > 0
          ? Math.round(reports.reduce((s, r) => s + r.overallScore, 0) / reports.length)
          : 0;

        return {
          name: c.title.length > 18 ? c.title.slice(0, 16) + "…" : c.title,
          role: c.role,
          pass,
          fail,
          avg,
          total: reports.length,
        };
      })
    );
    const filteredCampaignStats = campaignStats.filter(Boolean);

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
      campaignStats: filteredCampaignStats,
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
