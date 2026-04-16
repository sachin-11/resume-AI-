import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "secret");

async function getCandidateId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("candidate_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.sub as string;
  } catch { return null; }
}

// GET — candidate's all interviews + feedback
export async function GET(req: NextRequest) {
  const inviteId = await getCandidateId(req);
  if (!inviteId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invite = await db.candidateInvite.findUnique({
    where: { id: inviteId },
    include: { campaign: { select: { role: true, title: true, difficulty: true, roundType: true } } },
  });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // All invites for this email (multiple campaigns)
  const allInvites = await db.candidateInvite.findMany({
    where: { email: invite.email },
    include: {
      campaign: { select: { role: true, title: true, difficulty: true, roundType: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch feedback for each completed session
  const history = await Promise.all(
    allInvites.map(async (inv) => {
      if (!inv.sessionId) return { invite: inv, feedback: null };
      const feedback = await db.feedbackReport.findUnique({
        where: { sessionId: inv.sessionId },
        select: {
          overallScore: true, technicalScore: true,
          communicationScore: true, confidenceScore: true,
          strengths: true, weakAreas: true,
          improvementRoadmap: true, summary: true,
          betterAnswers: true, createdAt: true,
        },
      });
      return { invite: inv, feedback };
    })
  );

  return NextResponse.json({
    candidate: { email: invite.email, name: invite.name },
    history,
  });
}
