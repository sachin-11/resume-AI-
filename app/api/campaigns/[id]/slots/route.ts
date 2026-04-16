import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET — list slots for a campaign (public — candidates need this)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  const slots = await db.interviewSlot.findMany({
    where: { campaignId, isBooked: false, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });

  return NextResponse.json({ slots });
}

// POST — create slots (recruiter only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;

  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { slots } = await req.json() as { slots: Array<{ startsAt: string; durationMin?: number }> };
  if (!slots?.length) return NextResponse.json({ error: "slots array required" }, { status: 400 });

  const created = await db.interviewSlot.createMany({
    data: slots.map((s) => ({
      campaignId,
      startsAt: new Date(s.startsAt),
      durationMin: s.durationMin ?? 30,
    })),
  });

  return NextResponse.json({ created: created.count }, { status: 201 });
}

// DELETE — remove a slot
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;
  const { slotId } = await req.json();

  const slot = await db.interviewSlot.findFirst({
    where: { id: slotId, campaignId, campaign: { userId: session.user.id } },
  });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (slot.isBooked) return NextResponse.json({ error: "Cannot delete a booked slot" }, { status: 400 });

  await db.interviewSlot.delete({ where: { id: slotId } });
  return NextResponse.json({ success: true });
}
