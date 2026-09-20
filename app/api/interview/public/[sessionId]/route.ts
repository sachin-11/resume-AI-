import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyInviteToken } from "@/lib/candidateInvite";

// Public endpoint — no auth required (for candidate invite sessions)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const token = req.nextUrl.searchParams.get("token");

    if (!(await verifyInviteToken(sessionId, token))) {
      return NextResponse.json({ error: "Invalid or missing invite token" }, { status: 403 });
    }

    const session = await db.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          include: { answers: { orderBy: { createdAt: "asc" } } },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (err) {
    console.error("[PUBLIC_SESSION_GET]", err);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
