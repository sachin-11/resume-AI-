/**
 * PATCH /api/campaigns/[id]/invites/[inviteId]
 * Update candidate status: shortlisted | rejected | pending
 * Fires candidate_shortlisted webhook when status → "shortlisted"
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { dispatchWebhooks } from "@/lib/webhooks";
import type { WebhookPayload } from "@/lib/webhooks";

const ALLOWED_STATUSES = ["shortlisted", "rejected", "pending", "completed"] as const;
type InviteStatus = typeof ALLOWED_STATUSES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: campaignId, inviteId } = await params;
    const { status } = await req.json();

    if (!ALLOWED_STATUSES.includes(status as InviteStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify campaign ownership
    const campaign = await db.interviewCampaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const invite = await db.candidateInvite.findFirst({
      where: { id: inviteId, campaignId },
    });
    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

    const previousStatus = invite.status;

    const updated = await db.candidateInvite.update({
      where: { id: inviteId },
      data: { status },
    });

    // Fire candidate_shortlisted webhook when newly shortlisted
    if (status === "shortlisted" && previousStatus !== "shortlisted") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      // Get feedback score if interview was completed
      let scores = { overall: 0, technical: 0, communication: 0, confidence: 0 };
      if (invite.sessionId) {
        const feedback = await db.feedbackReport.findUnique({
          where: { sessionId: invite.sessionId },
          select: {
            overallScore: true,
            technicalScore: true,
            communicationScore: true,
            confidenceScore: true,
          },
        });
        if (feedback) {
          scores = {
            overall: feedback.overallScore,
            technical: feedback.technicalScore,
            communication: feedback.communicationScore,
            confidence: feedback.confidenceScore,
          };
        }
      }

      // Get tab switch count
      let tabSwitchCount = 0;
      if (invite.sessionId) {
        const interviewSession = await db.interviewSession.findUnique({
          where: { id: invite.sessionId },
          select: { tabSwitchCount: true },
        });
        tabSwitchCount = interviewSession?.tabSwitchCount ?? 0;
      }

      const payload: WebhookPayload = {
        event: "candidate_shortlisted",
        timestamp: new Date().toISOString(),
        data: {
          candidateName: invite.name ?? invite.email,
          candidateEmail: invite.email,
          role: campaign.role,
          campaignTitle: campaign.title,
          overallScore: scores.overall,
          technicalScore: scores.technical,
          communicationScore: scores.communication,
          confidenceScore: scores.confidence,
          tabSwitchCount,
          passed: scores.overall >= 60,
          shortlisted: true,
          dashboardUrl: `${appUrl}/campaigns`,
          sessionId: invite.sessionId ?? "",
        },
      };

      void dispatchWebhooks(session.user.id, "candidate_shortlisted", payload);
    }

    return NextResponse.json({ invite: updated });
  } catch (err) {
    console.error("[INVITE_STATUS_UPDATE]", err);
    return NextResponse.json({ error: "Failed to update invite status" }, { status: 500 });
  }
}
