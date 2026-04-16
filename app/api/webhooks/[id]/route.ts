import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { dispatchWebhooks, WebhookPayload } from "@/lib/webhooks";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();

  const wh = await db.webhookConfig.findFirst({ where: { id, userId: session.user.id } });
  if (!wh) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.webhookConfig.update({
    where: { id },
    data: {
      name: data.name ?? wh.name,
      url: data.url ?? wh.url,
      secret: data.secret !== undefined ? data.secret : wh.secret,
      events: data.events ?? wh.events,
      scoreThreshold: data.scoreThreshold !== undefined ? data.scoreThreshold : wh.scoreThreshold,
      isActive: data.isActive !== undefined ? data.isActive : wh.isActive,
    },
  });

  return NextResponse.json({ webhook: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const wh = await db.webhookConfig.findFirst({ where: { id, userId: session.user.id } });
  if (!wh) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.webhookConfig.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

// POST /api/webhooks/[id] — test webhook
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const wh = await db.webhookConfig.findFirst({ where: { id, userId: session.user.id } });
  if (!wh) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const testPayload: WebhookPayload = {
    event: "interview_completed",
    timestamp: new Date().toISOString(),
    data: {
      candidateName: "Test Candidate",
      candidateEmail: "test@example.com",
      role: "Senior Developer",
      campaignTitle: "Test Campaign",
      overallScore: 85,
      technicalScore: 80,
      communicationScore: 90,
      confidenceScore: 85,
      tabSwitchCount: 0,
      passed: true,
      shortlisted: true,
      dashboardUrl: `${appUrl}/campaigns`,
      sessionId: "test-session-id",
    },
  };

  await dispatchWebhooks(session.user.id, "interview_completed", testPayload);
  return NextResponse.json({ success: true, message: "Test webhook sent" });
}
