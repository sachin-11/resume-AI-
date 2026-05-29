/**
 * POST /api/job-agent/[id]/salary
 * Generates salary negotiation strategy for a job application
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateSalaryNegotiation } from "@/lib/jobAgent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { currentOffer } = body;

    const app = await db.jobApplication.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fetch resume text if linked
    let resumeText = "";
    if (app.resumeId) {
      const resume = await db.resume.findFirst({
        where: { id: app.resumeId, userId: session.user.id },
        select: { rawText: true },
      });
      resumeText = resume?.rawText ?? "";
    }

    const result = await generateSalaryNegotiation({
      jobTitle: app.jobTitle,
      company: app.company ?? "",
      jobDescription: app.jobDescription,
      resumeText,
      currentOffer: currentOffer?.trim() || undefined,
    });

    return NextResponse.json({ salary: result });
  } catch (err) {
    console.error("[SALARY_NEGOTIATION]", err);
    return NextResponse.json({ error: "Failed to generate salary strategy" }, { status: 500 });
  }
}
