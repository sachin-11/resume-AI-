/**
 * POST /api/auto-apply/jobs/[id]/one-click-apply
 *
 * One-click apply pipeline:
 * 1. Generate cover letter (if not already done)
 * 2. Send email to HR (if hrEmail provided + autoEmail enabled)
 * 3. Update status to applied/email_sent
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCoverLetter } from "@/lib/jobAgent";
import { sendHREmail } from "@/lib/mailer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { hrEmail, sendEmail = false, tone = "professional" } = body;

  const job = await db.autoApplyJob.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch resume text
  let resumeText = "";
  if (job.resumeId) {
    const resume = await db.resume.findFirst({
      where: { id: job.resumeId, userId: session.user.id },
      select: { rawText: true },
    });
    resumeText = resume?.rawText ?? "";
  }

  // Step 1: Generate cover letter if not already done
  let coverLetter = job.coverLetter ?? "";
  let coverLetterSubject = `Application for ${job.jobTitle} at ${job.company}`;

  if (!coverLetter && resumeText) {
    const result = await generateCoverLetter(
      resumeText,
      job.jobDescription,
      job.jobTitle,
      job.company,
      tone
    );
    coverLetter = result.coverLetter;
    coverLetterSubject = result.subject || coverLetterSubject;

    await db.autoApplyJob.update({
      where: { id },
      data: { coverLetter },
    });
  }

  // Step 2: Send email to HR — send whenever hrEmail is provided and SMTP is configured
  let emailSent = false;
  const effectiveHrEmail = (hrEmail || job.hrEmail)?.trim();

  if (effectiveHrEmail && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await sendHREmail({
        to: effectiveHrEmail,
        subject: coverLetterSubject,
        body: coverLetter,
        senderName: session.user.name ?? "Candidate",
        replyTo: session.user.email ?? undefined,
      });
      emailSent = true;
      console.log("[ONE_CLICK_APPLY] Email sent to:", effectiveHrEmail);
    } catch (err) {
      console.error("[ONE_CLICK_APPLY] Email failed:", err);
    }
  } else {
    console.log("[ONE_CLICK_APPLY] Email skipped — hrEmail:", effectiveHrEmail, "SMTP:", !!process.env.SMTP_USER);
  }

  // Step 3: Update status
  const newStatus = emailSent ? "email_sent" : "applied";
  const updated = await db.autoApplyJob.update({
    where: { id },
    data: {
      status: newStatus,
      coverLetter,
      hrEmail: effectiveHrEmail ?? job.hrEmail,
      appliedAt: new Date(),
      emailSentAt: emailSent ? new Date() : job.emailSentAt,
    },
  });

  return NextResponse.json({
    success: true,
    coverLetter,
    emailSent,
    status: newStatus,
    job: updated,
  });
}
