/**
 * GET  /api/mcp/approvals/[id]  — what an MCP client asked to do, for the approval page
 * POST /api/mcp/approvals/[id]  — { decision: "approve" | "decline" } by the signed-in recruiter
 *
 * The out-of-band half of book_interview for MCP clients that can't show a
 * confirmation form. Only the recruiter who owns the request can see or decide
 * it; approving books the slot here, in the web app — the AI can't press this.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotFoundError, decideApproval, getApproval, getCandidate } from "@/lib/mcp/data";

async function view(userId: string, id: string) {
  const a = await getApproval(userId, id);
  const candidate = await getCandidate(userId, a.candidateId).catch(() => null);
  const slot = await db.interviewSlot.findUnique({ where: { id: a.slotId }, select: { startsAt: true, durationMin: true } });
  return {
    id: a.id,
    action: a.action,
    status: a.status,
    clientId: a.clientId,
    message: a.message,
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
    candidate: candidate ? { name: candidate.name, role: candidate.campaign.role, campaign: candidate.campaign.title,
                             score: candidate.interview?.scores?.overall ?? null } : null,
    slot: slot ? { startsAt: slot.startsAt.toISOString(), durationMin: slot.durationMin } : null,
    outcome: a.outcome,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await view(session.user.id, id));
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}

const Body = z.object({ decision: z.enum(["approve", "decline"]) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "decision must be approve or decline" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    await decideApproval(session.user.id, id, parsed.data.decision);
    console.info(JSON.stringify({ event: "mcp_approval_decision", approval_id: id, user_id: session.user.id,
                                  decision: parsed.data.decision, at: new Date().toISOString() }));
    return NextResponse.json(await view(session.user.id, id));
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}
