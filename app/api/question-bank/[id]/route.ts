import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH — update question
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text, category, difficulty, tags, isActive } = await req.json();

  const q = await db.questionBank.findFirst({ where: { id, userId: session.user.id } });
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.questionBank.update({
    where: { id },
    data: {
      ...(text !== undefined ? { text } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  return NextResponse.json({ question: updated });
}

// DELETE — soft delete (isActive = false)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const q = await db.questionBank.findFirst({ where: { id, userId: session.user.id } });
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.questionBank.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
