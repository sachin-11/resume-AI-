/**
 * POST /api/job-agent/[id]/followup
 * Generates a follow-up email for a job application
 * Body: { stage, candidateName, daysSinceApplied? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateFollowUpEmail } from "@/lib/jobAgent";
import { z } from "zod";

const schema = z.object({
  stage:            z.enum(["after_apply", "after_interview", "no_response"]),
  candidateName:    z.string().min(1).max(100),
  daysSinceApplied: z.number().min(1).max(365).default(7),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const app = await db.jobApplication.findFirst({ where: { id, userId: session.user.id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await generateFollowUpEmail({
    jobTitle: app.jobTitle,
    company: app.company ?? "the company",
    candidateName: parsed.data.candidateName,
    daysSinceApplied: parsed.data.daysSinceApplied,
    stage: parsed.data.stage,
  });

  // Use raw query because Prisma client needs regeneration for new columns
  await db.$executeRaw`
    UPDATE "JobApplication"
    SET "followUpEmailDraft" = ${result.emailBody}
    WHERE id = ${id}
  `;

  return NextResponse.json({ followUp: result });
}
