/**
 * POST /api/campaigns/[id]/shortlist
 * The recruiter's confirmed shortlist (human-in-the-loop for the AI committee).
 * Replaces the campaign's shortlist with exactly these candidates.
 *
 * Body: { inviteIds: string[] (≤ 25), notes?: { [inviteId]: string } }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  inviteIds: z.array(z.string().max(64)).max(25),
  notes: z.record(z.string(), z.string().max(500)).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { inviteIds, notes = {} } = parsed.data;

  const { id: campaignId } = await ctx.params;
  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
    select: { id: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Only completed candidates of this campaign can be shortlisted.
  const valid = await db.candidateInvite.findMany({
    where: { id: { in: inviteIds }, campaignId, status: "completed" },
    select: { id: true },
  });
  if (valid.length !== new Set(inviteIds).size) {
    return NextResponse.json({ error: "Some candidates aren't completed interviews in this campaign." }, { status: 400 });
  }

  const now = new Date();
  await db.$transaction([
    db.candidateInvite.updateMany({
      where: { campaignId, shortlisted: true, id: { notIn: inviteIds } },
      data: { shortlisted: false, shortlistedAt: null, shortlistNote: null },
    }),
    ...inviteIds.map((id) =>
      db.candidateInvite.update({
        where: { id },
        data: { shortlisted: true, shortlistedAt: now, shortlistNote: notes[id] ?? null },
      }),
    ),
  ]);

  return NextResponse.json({ success: true, shortlisted: inviteIds.length });
}
