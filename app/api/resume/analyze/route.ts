import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { RESUME_ANALYSIS_SYSTEM, resumeAnalysisPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/utils";
import { ResumeAnalysis } from "@/types";
import { MOCK_RESUME_ANALYSIS } from "@/lib/mockData";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { resumeId } = await req.json();
    if (!resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    const resume = await db.resume.findFirst({
      where: { id: resumeId, userId: session.user.id },
    });

    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    let analysis: ResumeAnalysis;

    if (!process.env.GROQ_API_KEY) {
      analysis = MOCK_RESUME_ANALYSIS;
    } else {
      const raw = await callGroq(
        RESUME_ANALYSIS_SYSTEM,
        resumeAnalysisPrompt(resume.rawText)
      );
      analysis = safeJsonParse<ResumeAnalysis>(raw, MOCK_RESUME_ANALYSIS);
    }

    await db.resume.update({
      where: { id: resumeId },
      data: { analysisReport: analysis as object },
    });

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("[RESUME_ANALYZE]", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
