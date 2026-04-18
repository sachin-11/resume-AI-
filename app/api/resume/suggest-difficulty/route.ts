import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resumeId = req.nextUrl.searchParams.get("resumeId");
  if (!resumeId) return NextResponse.json({ difficulty: "intermediate" });

  const resume = await db.resume.findFirst({
    where: { id: resumeId, userId: session.user.id },
    select: { analysisReport: true },
  });

  if (!resume?.analysisReport) return NextResponse.json({ difficulty: "intermediate" });

  const report = resume.analysisReport as {
    experienceLevel?: string;
    yearsOfExperience?: number;
    overallScore?: number;
  };

  let difficulty = "intermediate";
  const years = report.yearsOfExperience ?? 0;
  const level = report.experienceLevel ?? "";
  const score = report.overallScore ?? 50;

  if (level === "junior" || years <= 1 || score < 50) {
    difficulty = "beginner";
  } else if (level === "senior" || years >= 5 || score >= 75) {
    difficulty = "advanced";
  } else {
    difficulty = "intermediate";
  }

  return NextResponse.json({
    difficulty,
    reason: `Based on ${years} year${years !== 1 ? "s" : ""} experience (${level || "unknown"} level, resume score: ${score}/100)`,
  });
}
