/**
 * POST /api/job-agent/[id]/linkedin
 * Generates 3-tone LinkedIn DM messages for referral/intro outreach
 */
import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 60;
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateLinkedInMessages } from "@/lib/jobAgent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { recipientName, recipientRole, senderName } = body;

    if (!recipientName?.trim()) {
      return NextResponse.json({ error: "recipientName required" }, { status: 400 });
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

    const result = await generateLinkedInMessages({
      recipientName: recipientName.trim(),
      recipientRole: recipientRole?.trim() ?? "Employee",
      company: app.company ?? "",
      jobTitle: app.jobTitle,
      jobDescription: app.jobDescription,
      resumeText,
      senderName: senderName?.trim() || session.user.name || "Candidate",
    });

    return NextResponse.json({ linkedin: result });
  } catch (err) {
    console.error("[LINKEDIN_MESSAGES]", err);
    return NextResponse.json({ error: "Failed to generate messages" }, { status: 500 });
  }
}
