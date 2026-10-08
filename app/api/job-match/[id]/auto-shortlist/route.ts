/**
 * POST /api/job-match/[id]/auto-shortlist
 *
 * Two steps, so nothing reaches a candidate without the recruiter's say-so:
 * - { dryRun: true, threshold } → preview: who qualifies (and who needs review); no side effects
 * - { resumeIds: [...] }        → for exactly those: shortlist email, campaign invite, webhook
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { previewShortlist, runAutoShortlist } from "@/lib/autoShortlist";
import { z } from "zod";

const schema = z.object({
  threshold:    z.number().min(1).max(100).default(65),
  companyName:  z.string().min(1).max(100).default("Our Company"),
  sendEmails:   z.boolean().default(true),
  fireWebhooks: z.boolean().default(true),
  campaignId:   z.string().optional(),
  dryRun:       z.boolean().default(false),
  resumeIds:    z.array(z.string().max(64)).max(50).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobDescriptionId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { dryRun, resumeIds, threshold, ...actions } = parsed.data;
  try {
    if (dryRun) {
      return NextResponse.json(await previewShortlist({ jobDescriptionId, userId: session.user.id, threshold }));
    }
    if (!resumeIds?.length) {
      return NextResponse.json({ error: "Select the candidates to shortlist (run a preview first)." }, { status: 400 });
    }
    const results = await runAutoShortlist({
      jobDescriptionId,
      userId: session.user.id,
      resumeIds,
      ...actions,
    });

    return NextResponse.json({
      shortlisted: results.length,
      emailsSent: results.filter((r) => r.emailSent).length,
      campaignInvites: results.filter((r) => r.campaignInviteCreated).length,
      webhooksFired: results.filter((r) => r.webhookFired).length,
      candidates: results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Auto-shortlist failed";
    console.error("[AUTO_SHORTLIST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
