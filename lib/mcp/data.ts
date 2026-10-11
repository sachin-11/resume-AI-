/**
 * Data access for the MCP server. Every query is scoped to the authenticated
 * recruiter (campaign.userId = caller) here, in one place — a tool can never
 * reach another recruiter's candidates by guessing an id.
 *
 * PII minimisation: what goes back to the MCP client ends up in a third-party
 * LLM's context, so candidate emails are masked. Tools act on ids, not emails.
 */
import { db } from "@/lib/db";
import { sendHREmail } from "@/lib/mailer";

export class NotFoundError extends Error {}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

// ── Pagination: opaque cursors (base64url offset) ────────────────
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const o = JSON.parse(Buffer.from(cursor, "base64url").toString()).o;
    return Number.isInteger(o) && o >= 0 ? o : 0;
  } catch {
    return 0;
  }
}

// ── Campaigns ────────────────────────────────────────────────────
export async function listCampaigns(userId: string, status: "active" | "closed" | "all", offset: number, limit: number) {
  const where = { userId, ...(status === "all" ? {} : { status }) };
  const rows = await db.interviewCampaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit + 1,
    select: {
      id: true, title: true, role: true, status: true, difficulty: true, roundType: true, createdAt: true,
      _count: { select: { invites: true } },
      invites: { select: { status: true, shortlisted: true } },
      slots: { where: { isBooked: false, startsAt: { gt: new Date() } }, select: { id: true } },
    },
  });
  const page = rows.slice(0, limit).map((c) => ({
    id: c.id,
    title: c.title,
    role: c.role,
    status: c.status,
    difficulty: c.difficulty,
    roundType: c.roundType,
    candidates: c._count.invites,
    completed: c.invites.filter((i) => i.status === "completed").length,
    shortlisted: c.invites.filter((i) => i.shortlisted).length,
    openSlots: c.slots.length,
    createdAt: c.createdAt.toISOString(),
  }));
  return { campaigns: page, hasMore: rows.length > limit };
}

export async function getCampaign(userId: string, campaignId: string) {
  const c = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId },
    select: { id: true, title: true, role: true, description: true, difficulty: true, roundType: true, status: true,
              questionCount: true, _count: { select: { invites: true } } },
  });
  if (!c) throw new NotFoundError("Campaign not found");
  return c;
}

// ── Candidates (CandidateInvite + interview session + feedback) ──
type CandidateFilter = { status?: "pending" | "started" | "completed"; minScore?: number; shortlistedOnly?: boolean };

export async function searchCandidates(userId: string, campaignId: string, f: CandidateFilter, offset: number, limit: number) {
  await getCampaign(userId, campaignId);
  const invites = await db.candidateInvite.findMany({
    where: { campaignId, ...(f.status ? { status: f.status } : {}), ...(f.shortlistedOnly ? { shortlisted: true } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, status: true, shortlisted: true, sessionId: true, scheduledAt: true },
  });
  const sessionIds = invites.map((i) => i.sessionId).filter((s): s is string => !!s);
  const sessions = sessionIds.length
    ? await db.interviewSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, integrityFlag: true, feedbackReport: { select: { overallScore: true, technicalScore: true, isFallback: true } } },
      })
    : [];
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const all = invites
    .map((i) => {
      const s = i.sessionId ? byId.get(i.sessionId) : undefined;
      const fb = s?.feedbackReport;
      return {
        id: i.id,
        name: i.name ?? "(no name)",
        email: maskEmail(i.email),
        status: i.status,
        shortlisted: i.shortlisted,
        overallScore: fb && !fb.isFallback ? fb.overallScore : null,
        technicalScore: fb && !fb.isFallback ? fb.technicalScore : null,
        integrityFlag: s?.integrityFlag ?? null,
        scheduledAt: i.scheduledAt?.toISOString() ?? null,
      };
    })
    .filter((c) => f.minScore === undefined || (c.overallScore ?? -1) >= f.minScore)
    // Deterministic order: best score first, then id (stable pages across calls).
    .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1) || a.id.localeCompare(b.id));
  return { candidates: all.slice(offset, offset + limit), total: all.length, hasMore: offset + limit < all.length };
}

export async function getCandidate(userId: string, candidateId: string) {
  const i = await db.candidateInvite.findFirst({
    where: { id: candidateId, campaign: { userId } },
    select: {
      id: true, name: true, email: true, status: true, shortlisted: true, shortlistNote: true, scheduledAt: true, sessionId: true,
      slotId: true,
      campaign: { select: { id: true, title: true, role: true } },
    },
  });
  if (!i) throw new NotFoundError("Candidate not found");
  const s = i.sessionId
    ? await db.interviewSession.findUnique({
        where: { id: i.sessionId },
        select: {
          status: true, integrityFlag: true, tabSwitchCount: true,
          feedbackReport: { select: { overallScore: true, technicalScore: true, communicationScore: true, confidenceScore: true,
                                      strengths: true, weakAreas: true, summary: true, isFallback: true } },
        },
      })
    : null;
  const fb = s?.feedbackReport;
  return {
    id: i.id,
    name: i.name ?? "(no name)",
    email: maskEmail(i.email),
    status: i.status,
    shortlisted: i.shortlisted,
    shortlistNote: i.shortlistNote,
    scheduledAt: i.scheduledAt?.toISOString() ?? null,
    slotId: i.slotId,
    campaign: i.campaign,
    interview: s
      ? {
          status: s.status,
          integrityFlag: s.integrityFlag,
          tabSwitches: s.tabSwitchCount,
          scores: fb && !fb.isFallback
            ? { overall: fb.overallScore, technical: fb.technicalScore, communication: fb.communicationScore, confidence: fb.confidenceScore }
            : null,
          strengths: fb?.strengths ?? [],
          weakAreas: fb?.weakAreas ?? [],
          summary: fb && !fb.isFallback ? fb.summary : "Feedback unavailable",
        }
      : null,
  };
}

// ── Slots + booking ──────────────────────────────────────────────
export async function openSlots(userId: string, campaignId: string) {
  await getCampaign(userId, campaignId);
  const slots = await db.interviewSlot.findMany({
    where: { campaignId, isBooked: false, startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 50,
    select: { id: true, startsAt: true, durationMin: true },
  });
  return slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), durationMin: s.durationMin }));
}

export interface BookingOutcome {
  booked: boolean;
  candidateId: string;
  slotId: string;
  startsAt?: string;
  emailSent: boolean;
  error?: string;
}

/** Atomic: claim a free slot of the candidate's own campaign, release any previous one, notify the candidate. */
export async function bookInterview(userId: string, candidateId: string, slotId: string, message: string): Promise<BookingOutcome> {
  const invite = await db.candidateInvite.findFirst({
    where: { id: candidateId, campaign: { userId } },
    select: { id: true, email: true, name: true, campaignId: true, slotId: true, status: true, campaign: { select: { role: true } } },
  });
  if (!invite) throw new NotFoundError("Candidate not found");
  // Idempotent on retry: the same candidate + slot again is a no-op, not a second email.
  if (invite.slotId === slotId) {
    return { booked: true, candidateId, slotId, emailSent: false, error: "Already booked into this slot — nothing changed" };
  }

  const slot = await db.$transaction(async (tx) => {
    const claimed = await tx.interviewSlot.updateMany({
      where: { id: slotId, campaignId: invite.campaignId, isBooked: false, startsAt: { gt: new Date() } },
      data: { isBooked: true },
    });
    if (claimed.count !== 1) return null;
    if (invite.slotId && invite.slotId !== slotId) {
      await tx.interviewSlot.update({ where: { id: invite.slotId }, data: { isBooked: false } });
    }
    const booked = await tx.interviewSlot.findUniqueOrThrow({ where: { id: slotId } });
    await tx.candidateInvite.update({ where: { id: invite.id }, data: { slotId, scheduledAt: booked.startsAt } });
    return booked;
  });
  if (!slot) return { booked: false, candidateId, slotId, emailSent: false, error: "That slot is no longer available" };

  let emailSent = false;
  let error: string | undefined;
  // MCP_SEND_EMAILS=false: dry-run bookings (staging, local tests) — the slot is booked, no email leaves.
  const emailsOn = process.env.MCP_SEND_EMAILS !== "false" && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (emailsOn) {
    const recruiter = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    const when = slot.startsAt.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" });
    try {
      await sendHREmail({
        to: invite.email,
        subject: `Interview scheduled — ${invite.campaign.role}`,
        body: `${message}\n\nWhen: ${when} (IST), ${slot.durationMin} minutes.`,
        senderName: recruiter?.name ?? "Recruitment Team",
        replyTo: recruiter?.email ?? undefined,
      });
      emailSent = true;
    } catch {
      error = "Slot booked, but the confirmation email failed to send.";
    }
  } else {
    error = process.env.MCP_SEND_EMAILS === "false"
      ? "Slot booked. Email not sent — MCP_SEND_EMAILS=false (dry run)."
      : "Slot booked. Email not sent — SMTP is not configured.";
  }
  return { booked: true, candidateId, slotId, startsAt: slot.startsAt.toISOString(), emailSent, error };
}

// ── Out-of-band approvals (approval link / URL-mode elicitation) ─
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export async function findOrCreateApproval(userId: string, clientId: string, candidateId: string, slotId: string, message: string) {
  const live = await db.mcpApproval.findFirst({
    where: { userId, candidateId, slotId, action: "book_interview", status: "pending", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (live) return live;
  return db.mcpApproval.create({
    data: { userId, clientId, action: "book_interview", candidateId, slotId, message, expiresAt: new Date(Date.now() + APPROVAL_TTL_MS) },
  });
}

export async function getApproval(userId: string, approvalId: string) {
  const a = await db.mcpApproval.findFirst({ where: { id: approvalId, userId } });
  if (!a) throw new NotFoundError("Approval not found");
  if (a.status === "pending" && a.expiresAt < new Date()) {
    return db.mcpApproval.update({ where: { id: a.id }, data: { status: "expired" } });
  }
  return a;
}

/** The recruiter's decision, made in the web app. Approving performs the booking here — not in the MCP tool. */
export async function decideApproval(userId: string, approvalId: string, decision: "approve" | "decline") {
  const a = await getApproval(userId, approvalId);
  if (a.status !== "pending") return a;
  // Claim the decision atomically so a double click can't book twice.
  const claimed = await db.mcpApproval.updateMany({
    where: { id: a.id, status: "pending" },
    data: { status: decision === "approve" ? "approved" : "declined", decidedAt: new Date() },
  });
  if (claimed.count !== 1) return getApproval(userId, approvalId);
  if (decision === "decline") return getApproval(userId, approvalId);
  const outcome = await bookInterview(userId, a.candidateId, a.slotId, a.message);
  return db.mcpApproval.update({ where: { id: a.id }, data: { outcome: JSON.parse(JSON.stringify(outcome)) } });
}
