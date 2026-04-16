import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET — list all questions (with optional category filter)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const search = req.nextUrl.searchParams.get("search") ?? undefined;

  const questions = await db.questionBank.findMany({
    where: {
      userId: session.user.id,
      isActive: true,
      ...(category && category !== "all" ? { category } : {}),
      ...(search ? { text: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ questions });
}

// POST — create a question
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, category, difficulty, tags } = await req.json();
  if (!text?.trim() || !category) {
    return NextResponse.json({ error: "text and category required" }, { status: 400 });
  }

  const question = await db.questionBank.create({
    data: {
      userId: session.user.id,
      text: text.trim(),
      category,
      difficulty: difficulty ?? "intermediate",
      tags: tags ?? [],
    },
  });

  return NextResponse.json({ question }, { status: 201 });
}
