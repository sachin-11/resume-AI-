/**
 * GET  /api/auto-apply/settings  — get user's auto-apply settings
 * POST /api/auto-apply/settings  — save/update settings
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  resumeId:        z.string().optional(),
  targetRole:      z.string().min(1).max(100),
  location:        z.string().default("India"),
  minMatchScore:   z.number().min(40).max(95).default(65),
  autoEmailEnabled:z.boolean().default(false),
  companyName:     z.string().max(100).default(""),
  dailyLimit:      z.number().min(1).max(20).default(10),
  isActive:        z.boolean().default(false),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await db.autoApplySettings.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const settings = await db.autoApplySettings.upsert({
    where: { userId: session.user.id },
    create: { ...parsed.data, userId: session.user.id },
    update: parsed.data,
  });

  return NextResponse.json({ settings });
}
