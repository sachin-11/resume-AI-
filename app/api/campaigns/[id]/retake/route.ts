import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// Allow a candidate to retake — creates a new invite token, resets status
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;
  const { inviteId } = await req.json();

  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const invite = await db.candidateInvite.findFirst({
    where: { id: inviteId, campaignId },
  });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  // Create a fresh invite (new token) for the same candidate
  const newInvite = await db.candidateInvite.create({
    data: {
      campaignId,
      email: invite.email,
      name: invite.name,
      portalPassword: await bcrypt.hash(Math.random().toString(36).slice(-8), 10),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json({
    invite: newInvite,
    link: `${appUrl}/interview/invite/${newInvite.token}`,
  });
}
