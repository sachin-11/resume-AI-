/**
 * PATCH /api/job-agent/[id]  — update status, notes, appliedAt
 * DELETE /api/job-agent/[id] — delete application
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  status:    z.enum(["draft", "applied", "interview", "offer", "rejected"]).optional(),
  notes:     z.string().max(2000).optional(),
  appliedAt: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const app = await db.jobApplication.findFirst({ where: { id, userId: session.user.id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.jobApplication.update({
    where: { id },
    data: {
      ...parsed.data,
      appliedAt: parsed.data.appliedAt ? new Date(parsed.data.appliedAt) : undefined,
    },
  });

  return NextResponse.json({ application: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const app = await db.jobApplication.findFirst({ where: { id, userId: session.user.id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.jobApplication.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
