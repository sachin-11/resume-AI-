import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendInterviewInvite } from "@/lib/mailer";
import { z } from "zod";
import bcrypt from "bcryptjs";

const inviteSchema = z.object({
  candidates: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
  })).min(1).max(50),
  companyName: z.string().default("Our Company"),
  sendEmail: z.boolean().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;

  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const body = await req.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { candidates, companyName, sendEmail } = parsed.data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const results = [];
  const errors = [];

  for (const candidate of candidates) {
    try {
      // If already invited, delete old invite and create fresh one
      const existing = await db.candidateInvite.findFirst({
        where: { campaignId, email: candidate.email },
      });
      if (existing) {
        await db.candidateInvite.delete({ where: { id: existing.id } });
      }

      const invite = await db.candidateInvite.create({
        data: {
          campaignId,
          email: candidate.email,
          name: candidate.name ?? "",
          portalPassword: await bcrypt.hash(Math.random().toString(36).slice(-8), 10),
        },
      });

      const interviewLink = `${appUrl}/interview/invite/${invite.token}`;

      if (sendEmail && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          await sendInterviewInvite({
            to: candidate.email,
            candidateName: candidate.name ?? "",
            role: campaign.role,
            companyName,
            interviewLink,
            difficulty: campaign.difficulty,
            roundType: campaign.roundType,
          });

          await db.candidateInvite.update({
            where: { id: invite.id },
            data: { emailSent: true },
          });
        } catch (mailErr) {
          console.error("[MAIL_ERROR]", candidate.email, mailErr);
          // Don't fail the whole invite — link still works
        }
      }

      results.push({ email: candidate.email, token: invite.token, link: interviewLink });
    } catch (err) {
      errors.push({ email: candidate.email, error: err instanceof Error ? err.message : "Failed" });
    }
  }

  return NextResponse.json({ results, errors });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;

  const invites = await db.candidateInvite.findMany({
    where: { campaign: { id: campaignId, userId: session.user.id } },
    orderBy: { createdAt: "desc" },
  });

  // Batch fetch all session data + feedback in 2 queries instead of N*2
  const sessionIds = invites.map((i) => i.sessionId).filter(Boolean) as string[];

  const [sessionDataMap, feedbackMap] = await Promise.all([
    sessionIds.length > 0
      ? db.interviewSession.findMany({
          where: { id: { in: sessionIds } },
          select: {
            id: true, tabSwitchCount: true, audioKey: true,
            multipleFacesCount: true, noFaceCount: true,
            lookingAwayCount: true, noiseCount: true, copyPasteCount: true,
            integrityFlag: true,
          },
        }).then((rows) => new Map(rows.map((r) => [r.id, r])))
      : Promise.resolve(new Map()),
    sessionIds.length > 0
      ? db.feedbackReport.findMany({
          where: { sessionId: { in: sessionIds } },
          select: { sessionId: true, overallScore: true },
        }).then((rows) => new Map(rows.map((r) => [r.sessionId, r.overallScore])))
      : Promise.resolve(new Map()),
  ]);

  const invitesWithScores = invites.map((inv) => {
    const sd = inv.sessionId ? sessionDataMap.get(inv.sessionId) : null;
    const score = inv.sessionId ? (feedbackMap.get(inv.sessionId) ?? null) : null;
    return {
      ...inv,
      score,
      tabSwitchCount: sd?.tabSwitchCount ?? 0,
      hasAudio: !!sd?.audioKey,
      integrityFlag: sd?.integrityFlag ?? "clean",
      proctoring: sd ? {
        multipleFaces: sd.multipleFacesCount,
        noFace: sd.noFaceCount,
        lookingAway: sd.lookingAwayCount,
        noise: sd.noiseCount,
        copyPaste: sd.copyPasteCount,
      } : null,
    };
  });

  return NextResponse.json({ invites: invitesWithScores });
}
