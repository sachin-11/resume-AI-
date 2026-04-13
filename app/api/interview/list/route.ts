import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await db.interviewSession.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        feedbackReport: { select: { overallScore: true } },
        _count: { select: { questions: true } },
      },
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[INTERVIEW_LIST]", err);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
