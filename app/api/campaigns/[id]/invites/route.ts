import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendInterviewInvite } from "@/lib/mailer";
import { z } from "zod";

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
      // Check if already invited
      const existing = await db.candidateInvite.findFirst({
        where: { campaignId, email: candidate.email },
      });
      if (existing) {
        errors.push({ email: candidate.email, error: "Already invited" });
        continue;
      }

      const invite = await db.candidateInvite.create({
        data: {
          campaignId,
          email: candidate.email,
          name: candidate.name ?? "",
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

  // Fetch scores for completed invites
  const invitesWithScores = await Promise.all(
    invites.map(async (inv) => {
      if (inv.sessionId) {
        const feedback = await db.feedbackReport.findUnique({
          where: { sessionId: inv.sessionId },
          select: { overallScore: true },
        });
        return { ...inv, score: feedback?.overallScore ?? null };
      }
      return { ...inv, score: null };
    })
  );

  return NextResponse.json({ invites: invitesWithScores });
}
