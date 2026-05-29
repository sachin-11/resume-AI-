/**
 * POST /api/job-agent/[id]/ats-score
 * Simulates ATS scoring — keyword match, section scores, quick fixes
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateATSScore } from "@/lib/jobAgent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const app = await db.jobApplication.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Use resume from app, or custom text passed in body
    let resumeText = body.resumeText?.trim() ?? "";
    if (!resumeText && app.resumeId) {
      const resume = await db.resume.findFirst({
        where: { id: app.resumeId, userId: session.user.id },
        select: { rawText: true },
      });
      resumeText = resume?.rawText ?? "";
    }

    if (!resumeText) {
      return NextResponse.json({ error: "No resume text found. Select a resume or paste text manually." }, { status: 400 });
    }

    const result = await generateATSScore({
      resumeText,
      jobDescription: app.jobDescription,
    });

    return NextResponse.json({ ats: result });
  } catch (err) {
    console.error("[ATS_SCORE]", err);
    return NextResponse.json({ error: "Failed to analyze ATS score" }, { status: 500 });
  }
}
