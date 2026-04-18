import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteId } = await params;
  const notes = await db.candidateNote.findMany({
    where: { inviteId, invite: { campaign: { userId: session.user.id } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteId } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Note text required" }, { status: 400 });

  const invite = await db.candidateInvite.findFirst({
    where: { id: inviteId, campaign: { userId: session.user.id } },
  });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const note = await db.candidateNote.create({
    data: { inviteId, userId: session.user.id, text: text.trim() },
  });
  return NextResponse.json({ note });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteId } = await params;
  const { noteId } = await req.json();

  await db.candidateNote.deleteMany({
    where: { id: noteId, userId: session.user.id, inviteId },
  });
  return NextResponse.json({ success: true });
}
