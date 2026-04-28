/**
 * POST /api/job-match/[id]/auto-shortlist
 *
 * Runs the full auto-shortlist pipeline:
 * - Finds candidates above score threshold
 * - Sends shortlist emails
 * - Adds to campaign (optional)
 * - Fires webhooks
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runAutoShortlist } from "@/lib/autoShortlist";
import { z } from "zod";

const schema = z.object({
  threshold:    z.number().min(1).max(100).default(65),
  companyName:  z.string().min(1).max(100).default("Our Company"),
  sendEmails:   z.boolean().default(true),
  fireWebhooks: z.boolean().default(true),
  campaignId:   z.string().optional(),
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

  try {
    const results = await runAutoShortlist({
      jobDescriptionId,
      userId: session.user.id,
      ...parsed.data,
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
