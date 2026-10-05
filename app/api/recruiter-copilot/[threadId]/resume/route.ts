/**
 * POST /api/recruiter-copilot/[threadId]/resume
 * The recruiter's answer to a paused Copilot run (human-in-the-loop gate).
 *
 * Body: { type: "confirm_rejection", decision: "reject"|"maybe"|"shortlist", note? }
 *     | { type: "book_interview", approved: boolean, slotId?, message? }
 *
 * agent-service records the decision and finishes the run; an approved booking is
 * then carried out here (slot booked atomically, confirmation emailed), because
 * the database and mailer live on this side.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendHREmail } from "@/lib/mailer";
import { logAgentUsage } from "@/lib/agentUsage";
import { agentHeaders } from "@/lib/agentAuth";
import { AGENT_URL, THREAD_ID_RE, copilotUser } from "@/lib/copilot-agent";

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("confirm_rejection"),
    decision: z.enum(["reject", "maybe", "shortlist"]),
    note: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("book_interview"),
    approved: z.boolean(),
    slotId: z.string().max(64).optional(),
    message: z.string().max(3000).optional(),
  }),
]);

interface BookingAction {
  status: "approved" | "declined";
  slot_id: string | null;
  candidate_name: string | null;
  candidate_email: string;
  message: string;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ threadId: string }> }) {
  const user = await copilotUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await ctx.params;
  if (!THREAD_ID_RE.test(threadId)) return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const body = parsed.data;

  // Fail before recording an approval for a slot that can't be booked anymore.
  if (body.type === "book_interview" && body.approved) {
    const free = body.slotId && await db.interviewSlot.findFirst({
      where: { id: body.slotId, isBooked: false, startsAt: { gt: new Date() }, campaign: { userId: user.id } },
      select: { id: true },
    });
    if (!free) return NextResponse.json({ error: "That slot is no longer available — pick another." }, { status: 409 });
  }

  let data;
  try {
    const res = await fetch(`${AGENT_URL}/threads/${threadId}/resume`, {
      method: "POST",
      headers: await agentHeaders(user),
      body: JSON.stringify(
        body.type === "confirm_rejection"
          ? { type: body.type, decision: body.decision, note: body.note ?? "" }
          : { type: body.type, approved: body.approved, slot_id: body.slotId, message: body.message ?? "" },
      ),
      signal: AbortSignal.timeout(60_000),
    });
    data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: typeof data.detail === "string" ? data.detail : "Copilot failed" },
        { status: res.status },
      );
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Copilot failed" }, { status: 500 });
  }
  logAgentUsage(data.usage, { userId: user.id, feature: "agent:recruiter-copilot" });

  const action: BookingAction | undefined = data.result?.action;
  if (action?.status !== "approved" || !action.slot_id) return NextResponse.json(data);

  // Atomic: only flips a slot that is still free and belongs to this recruiter,
  // so two approvals can never double-book it.
  const booked = await db.interviewSlot.updateMany({
    where: { id: action.slot_id, isBooked: false, startsAt: { gt: new Date() }, campaign: { userId: user.id } },
    data: { isBooked: true },
  });
  if (booked.count !== 1) {
    return NextResponse.json({ ...data, booking: { booked: false, emailSent: false, error: "Slot was taken before it could be booked." } });
  }

  const slot = await db.interviewSlot.findUnique({
    where: { id: action.slot_id },
    select: { startsAt: true, durationMin: true, campaign: { select: { role: true } } },
  });
  const when = slot?.startsAt.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" });

  let emailSent = false;
  let emailError: string | undefined;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const recruiter = await db.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });
    try {
      await sendHREmail({
        to: action.candidate_email,
        subject: `Interview scheduled${slot?.campaign.role ? ` — ${slot.campaign.role}` : ""}`,
        body: `${action.message}\n\nWhen: ${when} (IST), ${slot?.durationMin ?? 30} minutes.`,
        senderName: recruiter?.name ?? "Recruitment Team",
        replyTo: recruiter?.email ?? undefined,
      });
      emailSent = true;
    } catch (err) {
      console.error("[COPILOT_BOOKING_EMAIL]", err);
      emailError = "Slot booked, but the confirmation email failed to send.";
    }
  } else {
    emailError = "Slot booked. Email not sent — SMTP is not configured.";
  }

  return NextResponse.json({ ...data, booking: { booked: true, emailSent, scheduledAt: when, error: emailError } });
}
