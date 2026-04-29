/**
 * POST /api/job-agent/[id]/send-hr
 *
 * Sends an email directly to HR from the candidate.
 * Body: { hrEmail, subject, emailBody, senderName, replyTo?, template }
 * template: "cold_outreach" | "application_confirm" | "followup"
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendHREmail } from "@/lib/mailer";
import { z } from "zod";

const schema = z.object({
  hrEmail:    z.string().email("Enter a valid HR email"),
  subject:    z.string().min(1).max(200),
  emailBody:  z.string().min(10).max(3000),
  senderName: z.string().min(1).max(100),
  replyTo:    z.string().email().optional().or(z.literal("")),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const app = await db.jobApplication.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({
      error: "Email not configured. Add SMTP_USER and SMTP_PASS to your .env file.",
    }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  await sendHREmail({
    to:         parsed.data.hrEmail,
    subject:    parsed.data.subject,
    body:       parsed.data.emailBody,
    senderName: parsed.data.senderName,
    replyTo:    parsed.data.replyTo || session.user.email || undefined,
  });

  // Log sent email in notes
  const note = `📧 Email sent to HR (${parsed.data.hrEmail}) — "${parsed.data.subject}" on ${new Date().toLocaleDateString()}`;
  await db.jobApplication.update({
    where: { id },
    data: {
      notes: app.notes ? `${app.notes}\n${note}` : note,
      ...(app.status === "draft" ? { status: "applied", appliedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ success: true, sentTo: parsed.data.hrEmail });
}
