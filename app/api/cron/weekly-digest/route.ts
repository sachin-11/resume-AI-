import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendWeeklyDigest } from "@/lib/mailer";

// Called every Monday at 9 AM by a cron job
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all users who have campaigns
  const users = await db.user.findMany({
    where: { campaigns: { some: {} } },
    include: {
      campaigns: {
        where: { status: "active" },
        include: {
          invites: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
              },
            },
            include: {
              campaign: { select: { id: true } },
            },
          },
          _count: { select: { invites: true } },
        },
      },
    },
  });

  let sent = 0;

  for (const user of users) {
    if (!user.email || !user.campaigns.length) continue;

    // Build campaign stats
    const campaignStats = await Promise.all(
      user.campaigns.map(async (c) => {
        const invites = await db.candidateInvite.findMany({
          where: {
            campaignId: c.id,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: { status: true, sessionId: true },
        });

        const completed = invites.filter((i) => i.status === "completed");
        const sessionIds = completed.map((i) => i.sessionId).filter(Boolean) as string[];

        let avgScore: number | null = null;
        if (sessionIds.length > 0) {
          const reports = await db.feedbackReport.findMany({
            where: { sessionId: { in: sessionIds } },
            select: { overallScore: true },
          });
          if (reports.length > 0) {
            avgScore = Math.round(reports.reduce((s, r) => s + r.overallScore, 0) / reports.length);
          }
        }

        return {
          title: c.title,
          role: c.role,
          total: invites.length,
          completed: completed.length,
          avgScore,
        };
      })
    );

    // Only send if there was activity this week
    const hasActivity = campaignStats.some((c) => c.total > 0);
    if (!hasActivity) continue;

    try {
      await sendWeeklyDigest({
        to: user.email,
        recruiterName: user.name ?? "",
        campaigns: campaignStats,
      });
      sent++;
    } catch (err) {
      console.error("[WEEKLY_DIGEST]", user.email, err);
    }
  }

  return NextResponse.json({ sent });
}
