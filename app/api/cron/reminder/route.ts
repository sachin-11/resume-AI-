import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendInterviewReminder } from "@/lib/mailer";

// Called by a cron job every 15 minutes
// Sends reminder to candidates whose scheduledAt is within next 60-75 minutes
export async function GET(req: NextRequest) {
  // Simple secret check to prevent unauthorized calls
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 60 * 1000);
  const in75 = new Date(now.getTime() + 75 * 60 * 1000);

  // Find pending invites scheduled in next 60-75 min, reminder not yet sent
  const invites = await db.candidateInvite.findMany({
    where: {
      status: "pending",
      reminderSent: false,
      scheduledAt: { gte: in60, lte: in75 },
    },
    include: { campaign: true },
  });

  let sent = 0;
  for (const invite of invites) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const interviewLink = `${appUrl}/interview/invite/${invite.token}`;
      const scheduledAt = invite.scheduledAt!.toLocaleString("en-IN", {
        dateStyle: "medium", timeStyle: "short",
      });

      await sendInterviewReminder({
        to: invite.email,
        candidateName: invite.name ?? "",
        role: invite.campaign.role,
        interviewLink,
        scheduledAt,
      });

      await db.candidateInvite.update({
        where: { id: invite.id },
        data: { reminderSent: true },
      });
      sent++;
    } catch (err) {
      console.error("[REMINDER]", invite.email, err);
    }
  }

  return NextResponse.json({ sent, checked: invites.length });
}
