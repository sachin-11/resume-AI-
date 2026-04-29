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

const schema = z.object({
  resumeId: z.string().optional(),
  tone:     z.enum(["professional", "enthusiastic", "concise"]).default("professional"),
  steps:    z.array(z.enum(["gap", "cover", "questions", "checklist", "tailor"])).default(["gap", "cover", "questions", "checklist"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fetch the application
  const app = await db.jobApplication.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { resumeId, tone, steps } = parsed.data;
  const effectiveResumeId = resumeId ?? app.resumeId ?? null;

  // Fetch resume text
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

  // Run requested steps in parallel where possible
  const results: Record<string, unknown> = {};

  const runGap       = steps.includes("gap");
  const runCover     = steps.includes("cover");
  const runQuestions = steps.includes("questions");
  const runChecklist = steps.includes("checklist");
  const runTailor    = steps.includes("tailor");

  // Gap first (fast, others can use its context conceptually)
  if (runGap) {
    results.gap = await analyzeGap(resumeText, jd);
  }

  // Parallelize the rest
  const parallel: Promise<void>[] = [];

  if (runCover) {
    parallel.push(
      generateCoverLetter(resumeText, jd, jobTitle, company, tone)
        .then((r) => { results.coverLetter = r; })
    );
  }
  if (runQuestions) {
    parallel.push(
      generateInterviewQuestions(resumeText, jd, jobTitle)
        .then((r) => { results.questions = r; })
    );
  }
  if (runChecklist) {
    parallel.push(
      generateChecklist(resumeText, jd, jobTitle, company)
        .then((r) => { results.checklist = r; })
    );
  }
  if (runTailor) {
    parallel.push(
      tailorResume(resumeText, jd)
        .then((r) => { results.tailor = r; })
    );
  }

  await Promise.all(parallel);

  // Persist results to DB
  await db.jobApplication.update({
    where: { id },
    data: {
      resumeId: effectiveResumeId,
      ...(results.gap        ? { resumeGapAnalysis:    results.gap }        : {}),
      ...(results.coverLetter ? { coverLetter: (results.coverLetter as { coverLetter: string }).coverLetter } : {}),
      ...(results.questions  ? { interviewQuestions:   results.questions }  : {}),
      ...(results.checklist  ? { applicationChecklist: results.checklist }  : {}),
    },
  });

  // Save tailor result via raw query (Prisma client needs regen for new column)
  if (results.tailor) {
    await db.$executeRaw`
      UPDATE "JobApplication"
      SET "tailoredResumeBullets" = ${JSON.stringify(results.tailor)}::jsonb
      WHERE id = ${id}
    `;
  }

  return NextResponse.json({ ...results, applicationId: id });
}
