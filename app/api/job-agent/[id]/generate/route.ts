/**
 * POST /api/job-agent/[id]/generate
 *
 * Runs the full AI pipeline for a saved job application:
 * 1. Gap analysis
 * 2. Cover letter
 * 3. Interview questions
 * 4. Application checklist
 *
 * Body: { resumeId, tone?, steps? }
 * steps: array of which steps to run — defaults to all
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  analyzeGap, generateCoverLetter,
  generateInterviewQuestions, generateChecklist,
  tailorResume,
} from "@/lib/jobAgent";
import { z } from "zod";

export const maxDuration = 120;

const schema = z.object({
  resumeId: z.string().optional(),
  tone:     z.enum(["professional", "enthusiastic", "concise"]).default("professional"),
  steps:    z.array(z.enum(["gap", "cover", "questions", "checklist", "tailor"])).default(["gap", "cover", "questions", "checklist"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const app = await db.jobApplication.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const { resumeId, tone, steps } = parsed.data;
    const effectiveResumeId = resumeId ?? app.resumeId ?? null;

    let resumeText = "";
    if (effectiveResumeId) {
      const resume = await db.resume.findFirst({
        where: { id: effectiveResumeId, userId: session.user.id },
        select: { rawText: true },
      });
      resumeText = resume?.rawText ?? "";
    }

    if (!resumeText) {
      return NextResponse.json({ error: "No resume found. Please select a resume first." }, { status: 400 });
    }

    const jd = app.jobDescription;
    const jobTitle = app.jobTitle;
    const company = app.company ?? "the company";

    const results: Record<string, unknown> = {};

    // Step 1: Gap analysis first, save immediately
    if (steps.includes("gap")) {
      results.gap = await analyzeGap(resumeText, jd).catch(() => null);
      if (results.gap) {
        await db.jobApplication.update({
          where: { id },
          data: { resumeId: effectiveResumeId, resumeGapAnalysis: results.gap },
        }).catch(() => null);
      }
    }

    // Step 2: Cover letter + Interview questions in parallel (save each as it completes)
    const batch1: Promise<void>[] = [];

    if (steps.includes("cover")) {
      batch1.push(
        generateCoverLetter(resumeText, jd, jobTitle, company, tone)
          .then(async (r) => {
            results.coverLetter = r;
            await db.jobApplication.update({
              where: { id },
              data: { coverLetter: r.coverLetter },
            }).catch(() => null);
          }).catch(() => {})
      );
    }

    if (steps.includes("questions")) {
      batch1.push(
        generateInterviewQuestions(resumeText, jd, jobTitle)
          .then(async (r) => {
            results.questions = r;
            await db.jobApplication.update({
              where: { id },
              data: { interviewQuestions: r as object },
            }).catch(() => null);
          }).catch(() => {})
      );
    }

    await Promise.all(batch1);

    // Step 3: Checklist (sequential — depends on gap context)
    if (steps.includes("checklist")) {
      const checklist = await generateChecklist(resumeText, jd, jobTitle, company).catch(() => null);
      if (checklist) {
        results.checklist = checklist;
        await db.jobApplication.update({
          where: { id },
          data: { applicationChecklist: checklist as object },
        }).catch(() => null);
      }
    }

    // Step 4: Tailor resume (optional, most expensive — skip if not requested)
    if (steps.includes("tailor")) {
      const tailor = await tailorResume(resumeText, jd).catch(() => null);
      if (tailor) {
        results.tailor = tailor;
        await db.$executeRaw`
          UPDATE "JobApplication"
          SET "tailoredResumeBullets" = ${JSON.stringify(tailor)}::jsonb
          WHERE id = ${id}
        `.catch(() => null);
      }
    }

    return NextResponse.json({ ...results, applicationId: id });
  } catch (err) {
    console.error("[JOB_AGENT_GENERATE]", err);
    return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 500 });
  }
}
