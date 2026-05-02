/**
 * PATCH /api/auto-apply/jobs/[id]  — update job status / add cover letter / hr email
 * DELETE /api/auto-apply/jobs/[id] — delete job
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const job = await db.autoApplyJob.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.autoApplyJob.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.coverLetter && { coverLetter: body.coverLetter }),
      ...(body.hrEmail && { hrEmail: body.hrEmail }),
      ...(body.notes && { notes: body.notes }),
      ...(body.status === "applied" && !job.appliedAt && { appliedAt: new Date() }),
      ...(body.status === "email_sent" && !job.emailSentAt && { emailSentAt: new Date() }),
    },
  });

  return NextResponse.json({ job: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const job = await db.autoApplyJob.findFirst({ where: { id, userId: session.user.id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.autoApplyJob.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
