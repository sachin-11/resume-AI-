import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRemainingInterviews } from "@/lib/stripe";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true, interviewsThisMonth: true, planExpiresAt: true, monthResetAt: true },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reset monthly count if new month
  const now = new Date();
  const resetAt = user.monthResetAt;
  if (!resetAt || now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
    await db.user.update({
      where: { id: session.user.id },
      data: { interviewsThisMonth: 0, monthResetAt: now },
    });
    user.interviewsThisMonth = 0;
  }

  const remaining = getRemainingInterviews(user.plan, user.interviewsThisMonth);

  return NextResponse.json({
    plan: user.plan,
    interviewsThisMonth: user.interviewsThisMonth,
    remaining: remaining === Infinity ? null : remaining,
    planExpiresAt: user.planExpiresAt,
  });
}
