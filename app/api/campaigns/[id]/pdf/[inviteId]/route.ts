import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Returns JSON data for client-side PDF generation (jsPDF runs in browser)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId, inviteId } = await params;

  const invite = await db.candidateInvite.findFirst({
    where: { id: inviteId, campaignId, campaign: { userId: session.user.id } },
    include: { campaign: true },
  });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let feedback = null;
  let tabSwitchCount = 0;

  if (invite.sessionId) {
    [feedback] = await Promise.all([
      db.feedbackReport.findUnique({
        where: { sessionId: invite.sessionId },
      }),
    ]);
    const sessionData = await db.interviewSession.findUnique({
      where: { id: invite.sessionId },
      select: { tabSwitchCount: true },
    });
    tabSwitchCount = sessionData?.tabSwitchCount ?? 0;
  }

  return NextResponse.json({
    candidate: { name: invite.name, email: invite.email },
    campaign: {
      title: invite.campaign.title,
      role: invite.campaign.role,
      difficulty: invite.campaign.difficulty,
      roundType: invite.campaign.roundType,
    },
    feedback,
    tabSwitchCount,
    generatedAt: new Date().toISOString(),
  });
}
