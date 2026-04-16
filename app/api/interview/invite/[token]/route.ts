import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { QUESTION_GENERATION_SYSTEM, questionGenerationPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import { GeneratedQuestion } from "@/types";
import { MOCK_QUESTIONS } from "@/lib/mockData";

// GET — validate token and return campaign info
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await db.candidateInvite.findUnique({
    where: { token },
    include: { campaign: true },
  });

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  if (invite.status === "completed") return NextResponse.json({ error: "Interview already completed", completed: true }, { status: 410 });

  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      name: invite.name,
      status: invite.status,
      sessionId: invite.sessionId,
    },
    campaign: {
      title: invite.campaign.title,
      role: invite.campaign.role,
      difficulty: invite.campaign.difficulty,
      roundType: invite.campaign.roundType,
      questionCount: invite.campaign.questionCount,
      description: invite.campaign.description,
    },
  });
}

// POST — start the interview session for this invite
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const language = body.language ?? "en";

  const invite = await db.candidateInvite.findUnique({
    where: { token },
    include: { campaign: { include: { user: { select: { name: true } } } } },
  });

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  if (invite.status === "completed") return NextResponse.json({ error: "Already completed" }, { status: 410 });

  // If session already started, return existing session
  if (invite.sessionId) {
    const existing = await db.interviewSession.findUnique({
      where: { id: invite.sessionId },
      include: { questions: { orderBy: { orderIndex: "asc" }, include: { answers: true } } },
    });
    return NextResponse.json({ session: existing });
  }

  const { campaign } = invite;

  // Generate questions with language
  let questions: GeneratedQuestion[];
  if (!process.env.GROQ_API_KEY) {
    questions = MOCK_QUESTIONS[campaign.roundType] ?? MOCK_QUESTIONS.technical;
  } else {
    const raw = await callGroq(
      QUESTION_GENERATION_SYSTEM,
      questionGenerationPrompt({
        resumeText: "",
        role: campaign.role,
        difficulty: campaign.difficulty,
        roundType: campaign.roundType,
        count: campaign.questionCount,
        language,
      })
    );
    const parsed = safeJsonParse<GeneratedQuestion[]>(raw, MOCK_QUESTIONS.technical);
    questions = parsed.map((q, i) => ({ ...q, orderIndex: i + 1 }));
  }

  // Create interview session
  const interviewSession = await db.interviewSession.create({
    data: {
      userId: campaign.userId,
      title: `${campaign.role} — ${invite.name ?? invite.email}`,
      role: campaign.role,
      difficulty: campaign.difficulty,
      roundType: campaign.roundType,
      totalQuestions: questions.length,
      status: "active",
      language,
      questions: {
        create: questions.map((q) => ({
          text: q.text,
          type: q.type,
          orderIndex: q.orderIndex,
        })),
      },
    },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });

  // Link session to invite
  await db.candidateInvite.update({
    where: { token },
    data: { sessionId: interviewSession.id, status: "started" },
  });

  return NextResponse.json({ session: interviewSession }, { status: 201 });
}
