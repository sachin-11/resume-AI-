/**
 * GET  /api/job-match  — list all JDs for current user
 * POST /api/job-match  — create a new Job Description
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  company: z.string().max(100).optional(),
  description: z.string().min(50, "Job description must be at least 50 characters"),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jds = await db.jobDescription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { matches: true } } },
  });

  return NextResponse.json({ jobDescriptions: jds });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Verify user actually exists in DB before creating JD
  const userExists = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!userExists) {
    console.error("[JOB_MATCH] User not found in DB:", session.user.id);
    return NextResponse.json({ error: "User account not found. Please log out and log in again." }, { status: 400 });
  }

  const jd = await db.jobDescription.create({
    data: { ...parsed.data, userId: session.user.id },
  });

  return NextResponse.json({ jobDescription: jd }, { status: 201 });
}
