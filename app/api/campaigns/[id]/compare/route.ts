import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;
  const { searchParams } = req.nextUrl;
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];

  if (ids.length < 2 || ids.length > 4) {
    return NextResponse.json({ error: "Select 2-4 candidates to compare" }, { status: 400 });
  }

  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invites = await db.candidateInvite.findMany({
    where: { id: { in: ids }, campaignId },
  });

  const candidates = await Promise.all(invites.map(async (inv) => {
    if (!inv.sessionId) return { invite: inv, feedback: null, answers: [] };

    const [feedback, session_data] = await Promise.all([
      db.feedbackReport.findUnique({
        where: { sessionId: inv.sessionId },
        select: {
          overallScore: true, technicalScore: true,
          communicationScore: true, confidenceScore: true,
          strengths: true, weakAreas: true, summary: true,
        },
      }),
      db.interviewSession.findUnique({
        where: { id: inv.sessionId },
        select: {
          tabSwitchCount: true, integrityFlag: true,
          multipleFacesCount: true, lookingAwayCount: true, copyPasteCount: true,
          questions: {
            where: { type: "main" },
            orderBy: { orderIndex: "asc" },
            select: {
              text: true,
              answers: { select: { text: true }, take: 1 },
            },
          },
        },
      }),
    ]);

    return {
      invite: inv,
      feedback,
      proctoring: session_data ? {
        tabSwitches: session_data.tabSwitchCount,
        integrityFlag: session_data.integrityFlag,
        multipleFaces: session_data.multipleFacesCount,
        lookingAway: session_data.lookingAwayCount,
        copyPaste: session_data.copyPasteCount,
      } : null,
      answers: session_data?.questions.map((q) => ({
        question: q.text,
        answer: q.answers[0]?.text ?? null,
      })) ?? [],
    };
  }));

  return NextResponse.json({ campaign, candidates });
}
