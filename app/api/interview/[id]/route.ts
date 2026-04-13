import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const interviewSession = await db.interviewSession.findFirst({
      where: { id, userId: session.user.id },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          include: { answers: { orderBy: { createdAt: "asc" } } },
        },
        feedbackReport: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: interviewSession });
  } catch (err) {
    console.error("[INTERVIEW_GET]", err);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
