/**
 * POST /api/job-agent/[id]/tailor
 * AI rewrites resume bullets to match the JD
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { tailorResume } from "@/lib/jobAgent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const app = await db.jobApplication.findFirst({ where: { id, userId: session.user.id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resumeId = body.resumeId ?? app.resumeId;
  if (!resumeId) return NextResponse.json({ error: "No resume selected" }, { status: 400 });

  const resume = await db.resume.findFirst({
    where: { id: resumeId, userId: session.user.id },
    select: { rawText: true },
  });
  if (!resume?.rawText) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

  const result = await tailorResume(resume.rawText, app.jobDescription);

  // Use raw query because Prisma client needs regeneration for new columns
  await db.$executeRaw`
    UPDATE "JobApplication"
    SET "tailoredResumeBullets" = ${JSON.stringify(result)}::jsonb
    WHERE id = ${id}
  `;

  return NextResponse.json({ tailor: result });
}
