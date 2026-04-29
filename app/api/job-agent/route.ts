/**
 * GET  /api/job-agent  — list all saved applications
 * POST /api/job-agent  — create new application (save JD + metadata)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  jobTitle:       z.string().min(1).max(200),
  company:        z.string().max(100).optional().default(""),
  jobUrl:         z.string().url().optional().or(z.literal("")),
  jobDescription: z.string().min(30, "Job description too short"),
  resumeId:       z.string().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const apps = await db.jobApplication.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, jobTitle: true, company: true, jobUrl: true,
        status: true, createdAt: true, appliedAt: true,
        coverLetter: true, interviewQuestions: true,
        applicationChecklist: true, resumeGapAnalysis: true,
        resumeId: true,
      },
    });
    return NextResponse.json({ applications: apps });
  } catch (err) {
    console.error("[JOB_AGENT_GET]", err);
    // Return empty array instead of crashing — table may not exist yet in production
    return NextResponse.json({ applications: [] });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const app = await db.jobApplication.create({
    data: { ...parsed.data, userId: session.user.id },
  });

  return NextResponse.json({ application: app }, { status: 201 });
}
