/**
 * POST /api/job-agent/[id]/rejection-analyzer
 * Analyzes rejection email → why rejected, what to fix, alternative roles
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeRejection } from "@/lib/jobAgent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { rejectionEmail } = body;

    if (!rejectionEmail?.trim()) {
      return NextResponse.json({ error: "Paste the rejection email text" }, { status: 400 });
    }

    const app = await db.jobApplication.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let resumeText = "";
    if (app.resumeId) {
      const resume = await db.resume.findFirst({
        where: { id: app.resumeId, userId: session.user.id },
        select: { rawText: true },
      });
      resumeText = resume?.rawText ?? "";
    }

    const result = await analyzeRejection({
      rejectionEmail: rejectionEmail.trim(),
      jobTitle: app.jobTitle,
      company: app.company ?? "",
      jobDescription: app.jobDescription,
      resumeText,
    });

    // Auto-update application status to rejected
    await db.jobApplication.update({
      where: { id },
      data: { status: "rejected" },
    }).catch(() => null);

    return NextResponse.json({ analysis: result });
  } catch (err) {
    console.error("[REJECTION_ANALYZER]", err);
    return NextResponse.json({ error: "Failed to analyze rejection" }, { status: 500 });
  }
}
