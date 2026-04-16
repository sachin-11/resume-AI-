import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendScoreReport } from "@/lib/mailer";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;

  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invites = await db.candidateInvite.findMany({
    where: { campaignId, status: "completed" },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const inv of invites) {
    if (!inv.sessionId) continue;
    const feedback = await db.feedbackReport.findUnique({
      where: { sessionId: inv.sessionId },
    });
    if (!feedback) continue;

    try {
      await sendScoreReport({
        to: inv.email,
        candidateName: inv.name ?? "",
        role: campaign.role,
        overallScore: feedback.overallScore,
        technicalScore: feedback.technicalScore,
        communicationScore: feedback.communicationScore,
        confidenceScore: feedback.confidenceScore,
        strengths: feedback.strengths,
        weakAreas: feedback.weakAreas,
        summary: feedback.summary,
      });
      sent++;
    } catch (err) {
      errors.push(inv.email);
      console.error("[BULK_EMAIL]", inv.email, err);
    }
  }

  return NextResponse.json({ sent, failed: errors.length, errors });
}
