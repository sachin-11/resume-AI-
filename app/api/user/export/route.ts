import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GDPR Article 20 — Right to data portability
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [user, resumes, sessions, campaigns] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, targetRole: true, techStack: true, experienceYears: true, plan: true, createdAt: true },
    }),
    db.resume.findMany({
      where: { userId },
      select: { id: true, fileName: true, fileType: true, createdAt: true },
    }),
    db.interviewSession.findMany({
      where: { userId },
      include: {
        questions: { include: { answers: true } },
        feedbackReport: { select: { overallScore: true, technicalScore: true, communicationScore: true, confidenceScore: true, strengths: true, weakAreas: true, summary: true } },
      },
    }),
    db.interviewCampaign.findMany({
      where: { userId },
      select: { id: true, title: true, role: true, createdAt: true, _count: { select: { invites: true } } },
    }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: user,
    resumes: resumes.map((r) => ({ id: r.id, fileName: r.fileName, uploadedAt: r.createdAt })),
    interviews: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      role: s.role,
      difficulty: s.difficulty,
      roundType: s.roundType,
      status: s.status,
      date: s.createdAt,
      feedback: s.feedbackReport,
      questionsAndAnswers: s.questions.map((q) => ({
        question: q.text,
        answer: q.answers[0]?.text ?? null,
      })),
    })),
    campaigns: campaigns.map((c) => ({ id: c.id, title: c.title, role: c.role, inviteCount: c._count.invites, createdAt: c.createdAt })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
