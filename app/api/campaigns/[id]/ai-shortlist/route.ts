/**
 * POST /api/campaigns/[id]/ai-shortlist
 * Queues the AI hiring committee for a campaign: every completed candidate is
 * assessed in parallel and ranked into a suggested shortlist. Returns { jobId };
 * poll /api/agent-jobs/[id]. Nothing is saved until the recruiter confirms
 * (POST /api/campaigns/[id]/shortlist).
 *
 * Body: { shortlistSize?: 1-25, jobDescription?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitAgentJob } from "@/lib/agentJobs";

const MAX_CANDIDATES = 100;
const ANSWERS_PER_CANDIDATE = 8;

const schema = z.object({
  shortlistSize: z.number().int().min(1).max(25).default(5),
  jobDescription: z.string().max(8000).optional(),
});

const clamp = (n: number | null | undefined) => Math.max(0, Math.min(100, Math.round(n ?? 0)));

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { id: campaignId } = await ctx.params;
  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
    select: { role: true, description: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const invites = await db.candidateInvite.findMany({
    where: { campaignId, status: "completed", sessionId: { not: null } },
    select: { id: true, name: true, email: true, sessionId: true },
  });
  if (invites.length < 2) {
    return NextResponse.json({ error: "Need at least 2 completed interviews to build a shortlist." }, { status: 400 });
  }

  const sessions = await db.interviewSession.findMany({
    where: { id: { in: invites.map((i) => i.sessionId as string) } },
    select: {
      id: true, tabSwitchCount: true, integrityFlag: true,
      feedbackReport: {
        select: {
          overallScore: true, technicalScore: true, communicationScore: true, confidenceScore: true,
          strengths: true, weakAreas: true, summary: true, isFallback: true,
        },
      },
      questions: {
        orderBy: { orderIndex: "asc" },
        take: ANSWERS_PER_CANDIDATE,
        select: { text: true, answers: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true } } },
      },
    },
  });
  const bySession = new Map(sessions.map((s) => [s.id, s]));

  const candidates = invites
    .map((inv) => {
      const s = bySession.get(inv.sessionId as string);
      const fb = s?.feedbackReport;
      if (!s || !fb) return null;
      return {
        id: inv.id,
        name: inv.name || inv.email,          // shown to the recruiter; agent-service never sends it to the LLM
        overall_score: clamp(fb.overallScore),
        technical_score: clamp(fb.technicalScore),
        communication_score: clamp(fb.communicationScore),
        confidence_score: clamp(fb.confidenceScore),
        strengths: fb.strengths.slice(0, 20),
        weak_areas: fb.weakAreas.slice(0, 20),
        summary: fb.summary.slice(0, 2000),
        integrity_flag: ["clean", "warning", "suspicious"].includes(s.integrityFlag) ? s.integrityFlag : "warning",
        tab_switch_count: s.tabSwitchCount,
        feedback_is_fallback: fb.isFallback,
        answers: s.questions
          .filter((q) => q.answers.length > 0)
          .map((q) => ({ question: q.text.slice(0, 2000), answer: q.answers[0].text.slice(0, 4000) })),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    // Over the cap: the committee looks at the top scorers.
    .sort((a, b) => b.overall_score - a.overall_score)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length < 2) {
    return NextResponse.json({ error: "Need at least 2 interviews with feedback to build a shortlist." }, { status: 400 });
  }

  return submitAgentJob(session.user, "campaign-shortlist", {
    role: campaign.role,
    job_description: parsed.data.jobDescription || campaign.description || "",
    shortlist_size: parsed.data.shortlistSize,
    candidates,
  });
}
