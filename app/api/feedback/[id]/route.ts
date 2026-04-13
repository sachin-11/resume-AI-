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

    const feedback = await db.feedbackReport.findFirst({
      where: {
        sessionId: id,
        session: { userId: session.user.id },
      },
      include: {
        session: {
          select: { title: true, role: true, roundType: true, difficulty: true, createdAt: true },
        },
      },
    });

    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    return NextResponse.json({ feedback });
  } catch (err) {
    console.error("[FEEDBACK_GET]", err);
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}
