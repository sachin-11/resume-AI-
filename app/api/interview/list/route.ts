import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = 20;
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      db.interviewSession.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          feedbackReport: { select: { overallScore: true } },
          _count: { select: { questions: true } },
        },
      }),
      db.interviewSession.count({ where: { userId: session.user.id } }),
    ]);

    return NextResponse.json({ sessions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[INTERVIEW_LIST]", err);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
