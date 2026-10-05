/**
 * POST /api/recruiter-copilot
 * One turn of the Recruitment Copilot conversation (multi-turn, memory in agent-service),
 * queued as a background job — returns { jobId }; the page polls /api/agent-jobs/[id]
 * for live step-by-step progress and the reply.
 * Body: { message, threadId?, resumeId?, jobDescription?, candidateName?, candidateEmail?, githubUsername? }
 * Context fields only need to be sent once — the thread remembers them.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { submitAgentJob } from "@/lib/agentJobs";
import { THREAD_ID_RE, copilotUser } from "@/lib/copilot-agent";

const schema = z.object({
  message:        z.string().trim().min(3, "Message is too short").max(4000),
  threadId:       z.string().regex(THREAD_ID_RE).optional(),
  resumeId:       z.string().optional(),
  jobDescription: z.string().max(20_000).optional(),
  candidateName:  z.string().max(200).optional(),
  candidateEmail: z.string().email().optional().or(z.literal("")),
  githubUsername: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const user = await copilotUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const body = parsed.data;

  let resumeText: string | undefined;
  if (body.resumeId) {
    const resume = await db.resume.findFirst({
      where: { id: body.resumeId, userId: user.id },
      select: { rawText: true },
    });
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    resumeText = resume.rawText;
  }

  // Fresh every turn so the scheduler never proposes a slot booked since the last message.
  const slots = await db.interviewSlot.findMany({
    where: { campaign: { userId: user.id }, isBooked: false, startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 20,
    select: { id: true, startsAt: true, durationMin: true, isBooked: true },
  });

  return submitAgentJob(user, "orchestrate", {
    user_message: body.message,
    user_id: user.id,
    thread_id: body.threadId,
    resume_text: resumeText,
    job_description: body.jobDescription || undefined,
    candidate_name: body.candidateName || undefined,
    candidate_email: body.candidateEmail || undefined,
    github_username: body.githubUsername || undefined,
    existing_slots: slots.map((s) => ({ ...s, startsAt: s.startsAt.toISOString() })),
  });
}
