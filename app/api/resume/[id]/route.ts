import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteResumeVectors } from "@/lib/rag";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const resume = await db.resume.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!resume) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.resume.delete({ where: { id } });

  // Clean up Pinecone vectors (non-blocking)
  deleteResumeVectors(id).catch((e) => console.error("[RAG_DELETE]", e));

  return NextResponse.json({ success: true });
}
