/**
 * Auto-Shortlist Pipeline
 *
 * Given a JD + score threshold:
 * 1. Find all matches above threshold
 * 2. Send shortlist email to each candidate (if email available on resume)
 * 3. Optionally add to a campaign as invite
 * 4. Fire webhook: candidate_shortlisted
 * 5. Return summary
 */

import { db } from "@/lib/db";
import { dispatchWebhooks } from "@/lib/webhooks";
import nodemailer from "nodemailer";

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER?.trim(),
      pass: process.env.SMTP_PASS?.replace(/\s/g, "").trim(),
    },
  });
}

// ── Shortlist email to candidate ─────────────────────────────────
async function sendShortlistEmail({
  to,
  candidateName,
  role,
  score,
  matchedSkills,
  companyName,
}: {
  to: string;
  candidateName: string;
  role: string;
  score: number;
  matchedSkills: string[];
  companyName: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const skillChips = matchedSkills
    .slice(0, 6)
    .map(
      (s) =>
        `<span style="display:inline-block;background:#1e1e2e;border:1px solid #7c3aed44;border-radius:6px;padding:3px 10px;font-size:11px;color:#a78bfa;margin:2px">${s}</span>`
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e2e8f0;margin:0;padding:40px 20px">
<div style="max-width:520px;margin:0 auto;background:#111118;border:1px solid #1e1e2e;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;text-align:center">
    <div style="font-size:40px;margin-bottom:8px">🎉</div>
    <h1 style="color:#fff;margin:0;font-size:22px">You've Been Shortlisted!</h1>
    <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">${companyName} — ${role}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#94a3b8;margin:0 0 16px">Hello <strong style="color:#e2e8f0">${candidateName || "Candidate"}</strong>,</p>
    <p style="color:#94a3b8;margin:0 0 20px">
      Great news! After reviewing your resume, <strong style="color:#e2e8f0">${companyName}</strong> has shortlisted you 
      for the <strong style="color:#e2e8f0">${role}</strong> position.
    </p>
    <div style="background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:20px;margin:0 0 20px;text-align:center">
      <p style="color:#64748b;font-size:12px;margin:0 0 4px">Your Match Score</p>
      <div style="font-size:52px;font-weight:900;color:${score >= 85 ? "#22c55e" : score >= 65 ? "#3b82f6" : "#eab308"}">${score}<span style="font-size:20px;color:#64748b">/100</span></div>
    </div>
    ${matchedSkills.length > 0 ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 8px"><strong style="color:#e2e8f0">Your matching skills:</strong></p><div style="margin-bottom:20px">${skillChips}</div>` : ""}
    <p style="color:#94a3b8;font-size:13px">Our team will be in touch shortly with next steps. Stay tuned!</p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center">
    <p style="color:#475569;font-size:11px;margin:0">Powered by <a href="${appUrl}" style="color:#7c3aed;text-decoration:none">AI Resume Coach</a></p>
  </div>
</div>
</body></html>`;

  await getTransporter().sendMail({
    from: `"${companyName}" <${process.env.SMTP_USER}>`,
    to,
    subject: `🎉 You've been shortlisted for ${role} at ${companyName}`,
    html,
  });
}

// ── Extract email from resume text (best-effort) ─────────────────
function extractEmailFromText(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

// ── Main pipeline ────────────────────────────────────────────────
export interface ShortlistResult {
  resumeId: string;
  fileName: string;
  score: number;
  email: string | null;
  emailSent: boolean;
  webhookFired: boolean;
  campaignInviteCreated: boolean;
}

export async function runAutoShortlist({
  jobDescriptionId,
  userId,
  threshold,
  campaignId,
  companyName,
  sendEmails,
  fireWebhooks,
}: {
  jobDescriptionId: string;
  userId: string;
  threshold: number;       // e.g. 65
  campaignId?: string;     // optional: add to campaign
  companyName: string;
  sendEmails: boolean;
  fireWebhooks: boolean;
}): Promise<ShortlistResult[]> {
  // 1. Fetch JD
  const jd = await db.jobDescription.findFirst({
    where: { id: jobDescriptionId, userId },
  });
  if (!jd) throw new Error("Job description not found");

  // 2. Fetch matches above threshold
  const matches = await db.resumeMatch.findMany({
    where: { jobDescriptionId, score: { gte: threshold } },
    orderBy: { score: "desc" },
    include: { resume: { select: { fileName: true, rawText: true } } },
  });

  if (matches.length === 0) return [];

  const results: ShortlistResult[] = [];

  for (const match of matches) {
    const result: ShortlistResult = {
      resumeId: match.resumeId,
      fileName: match.resume.fileName,
      score: match.score,
      email: null,
      emailSent: false,
      webhookFired: false,
      campaignInviteCreated: false,
    };

    // Extract email from resume text
    const email = extractEmailFromText(match.resume.rawText);
    result.email = email;

    // 3. Send shortlist email
    if (sendEmails && email && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await sendShortlistEmail({
          to: email,
          candidateName: match.resume.fileName.replace(/\.[^.]+$/, ""),
          role: jd.title,
          score: match.score,
          matchedSkills: match.matchedSkills,
          companyName,
        });
        result.emailSent = true;
      } catch (err) {
        console.error("[AUTO_SHORTLIST] Email failed:", email, err);
      }
    }

    // 4. Add to campaign as invite
    if (campaignId && email) {
      try {
        const campaign = await db.interviewCampaign.findFirst({
          where: { id: campaignId, userId },
        });
        if (campaign) {
          const existing = await db.candidateInvite.findFirst({
            where: { campaignId, email },
          });
          if (!existing) {
            await db.candidateInvite.create({
              data: {
                campaignId,
                email,
                name: match.resume.fileName.replace(/\.[^.]+$/, ""),
              },
            });
            result.campaignInviteCreated = true;
          }
        }
      } catch (err) {
        console.error("[AUTO_SHORTLIST] Campaign invite failed:", err);
      }
    }

    // 5. Fire webhook
    if (fireWebhooks) {
      try {
        await dispatchWebhooks(userId, "candidate_shortlisted", {
          event: "candidate_shortlisted",
          timestamp: new Date().toISOString(),
          data: {
            candidateName: match.resume.fileName.replace(/\.[^.]+$/, ""),
            candidateEmail: email ?? "unknown",
            role: jd.title,
            campaignTitle: jd.title,
            overallScore: match.score,
            technicalScore: match.score,
            communicationScore: 0,
            confidenceScore: 0,
            tabSwitchCount: 0,
            passed: match.score >= 60,
            shortlisted: true,
            dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/job-match`,
            sessionId: match.resumeId,
          },
        });
        result.webhookFired = true;
      } catch (err) {
        console.error("[AUTO_SHORTLIST] Webhook failed:", err);
      }
    }

    results.push(result);
  }

  return results;
}
