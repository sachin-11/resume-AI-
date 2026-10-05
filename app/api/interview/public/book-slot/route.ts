import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendInterviewReminder } from "@/lib/mailer";
import { rateLimit, RATE_LIMITS, getIP, rateLimitResponse } from "@/lib/rate-limit";

// Candidate books a slot via their invite token
export async function POST(req: NextRequest) {
  const rl = rateLimit(getIP(req), RATE_LIMITS.bookSlot);
  if (!rl.success) return rateLimitResponse(rl);
  try {
    const { token, slotId } = await req.json();
    if (!token || !slotId) return NextResponse.json({ error: "token and slotId required" }, { status: 400 });

    const invite = await db.candidateInvite.findUnique({
      where: { token },
      include: { campaign: true },
    });
    if (!invite) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (invite.status === "completed") return NextResponse.json({ error: "Interview already completed" }, { status: 400 });

    // One transaction: claim the slot atomically (the isBooked=false condition is part
    // of the UPDATE, so two candidates can never both get it), free the candidate's
    // previous slot when rescheduling, and link the invite — all or nothing.
    const slot = await db.$transaction(async (tx) => {
      const claimed = await tx.interviewSlot.updateMany({
        where: { id: slotId, campaignId: invite.campaignId, isBooked: false, startsAt: { gte: new Date() } },
        data: { isBooked: true },
      });
      if (claimed.count !== 1) return null;

      if (invite.slotId && invite.slotId !== slotId) {
        await tx.interviewSlot.update({ where: { id: invite.slotId }, data: { isBooked: false } });
      }
      const booked = await tx.interviewSlot.findUniqueOrThrow({ where: { id: slotId } });
      await tx.candidateInvite.update({
        where: { token },
        data: { slotId, scheduledAt: booked.startsAt },
      });
      return booked;
    });
    if (!slot) return NextResponse.json({ error: "Slot not available" }, { status: 400 });

    // Send confirmation + reminder email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const interviewLink = `${appUrl}/interview/invite/${token}`;
    const scheduledAt = slot.startsAt.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" });

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      // Confirmation email (immediate)
      sendInterviewReminder({
        to: invite.email,
        candidateName: invite.name ?? "",
        role: invite.campaign.role,
        interviewLink,
        scheduledAt,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      scheduledAt: slot.startsAt,
      message: `Interview scheduled for ${scheduledAt}`,
    });
  } catch (err) {
    console.error("[BOOK_SLOT]", err);
    return NextResponse.json({ error: "Failed to book slot" }, { status: 500 });
  }
}
