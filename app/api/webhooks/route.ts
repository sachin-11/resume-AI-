import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhooks = await db.webhookConfig.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ webhooks });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, url, secret, events, scoreThreshold } = await req.json();

  if (!name || !type || !url || !events?.length) {
    return NextResponse.json({ error: "name, type, url, events required" }, { status: 400 });
  }

  const webhook = await db.webhookConfig.create({
    data: {
      userId: session.user.id,
      name, type, url,
      secret: secret || null,
      events,
      scoreThreshold: scoreThreshold ?? null,
    },
  });

  return NextResponse.json({ webhook }, { status: 201 });
}
