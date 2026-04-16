import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { RESUME_ANALYSIS_SYSTEM, atsMatchPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import { ResumeAnalysis } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { resumeId, jobDescription } = await req.json();
    if (!resumeId || !jobDescription?.trim()) {
      return NextResponse.json({ error: "resumeId and jobDescription required" }, { status: 400 });
    }

    const resume = await db.resume.findFirst({
      where: { id: resumeId, userId: session.user.id },
    });
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

    const raw = await callGroq(
      RESUME_ANALYSIS_SYSTEM,
      atsMatchPrompt(resume.rawText, jobDescription)
    );

    const atsMatch = safeJsonParse<ResumeAnalysis["atsMatch"]>(raw, {
      score: 0,
      matchedKeywords: [],
      missingKeywords: [],
      extraKeywords: [],
      recommendation: "Could not analyze. Please try again.",
    });

    // Save atsMatch into existing analysisReport
    const existing = (resume.analysisReport ?? {}) as Record<string, unknown>;
    const updated = { ...existing, atsMatch };

    await db.resume.update({
      where: { id: resumeId },
      data: { analysisReport: updated },
    });

    return NextResponse.json({ atsMatch });
  } catch (err) {
    console.error("[ATS_MATCH]", err);
    return NextResponse.json({ error: "ATS match failed" }, { status: 500 });
  }
}
