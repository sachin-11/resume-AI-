import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await req.json();

    await db.interviewSession.updateMany({
      where: { id: sessionId, userId: session.user.id },
      data: { status: "completed" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[INTERVIEW_COMPLETE]", err);
    return NextResponse.json({ error: "Failed to complete session" }, { status: 500 });
  }
}
