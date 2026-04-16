import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  roundType: z.enum(["hr", "technical", "behavioral", "system_design"]),
  questionCount: z.number().min(3).max(15).default(5),
  description: z.string().max(300).optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaigns = await db.interviewCampaign.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { invites: true } },
        invites: { select: { status: true } },
      },
    });

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("[CAMPAIGNS_GET]", err);
    return NextResponse.json({ campaigns: [], error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const campaign = await db.interviewCampaign.create({
      data: { ...parsed.data, userId: session.user.id },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error("[CAMPAIGNS_POST]", err);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
