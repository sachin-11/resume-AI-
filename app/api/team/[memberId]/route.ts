import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/permissions";

// PATCH — update member role
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireRole(session.user.role, "manageTeam")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { memberId } = await params;
  const { role } = await req.json();
  if (!["recruiter", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    include: { org: true },
  });
  if (!member || member.org.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await Promise.all([
    db.teamMember.update({ where: { id: memberId }, data: { role } }),
    db.user.update({ where: { id: member.userId }, data: { role } }),
  ]);

  return NextResponse.json({ success: true });
}

// DELETE — remove member
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireRole(session.user.role, "manageTeam")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { memberId } = await params;
  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    include: { org: true },
  });
  if (!member || member.org.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.teamMember.delete({ where: { id: memberId } });
  return NextResponse.json({ success: true });
}
