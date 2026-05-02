import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const search = searchParams.get("search") ?? "";
  const limit = 20;

  const where = search ? {
    OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { email: { contains: search, mode: "insensitive" as const } },
    ],
  } : {};

  const [users, total, stats] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, name: true, email: true, plan: true, role: true,
        createdAt: true, interviewsThisMonth: true, phoneVerified: true,
        _count: { select: { interviewSessions: true, resumes: true, campaigns: true } },
      },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ["plan"], _count: { id: true } }),
  ]);

  const planCounts = Object.fromEntries(stats.map((s) => [s.plan, s._count.id]));

  return NextResponse.json({ users, total, pages: Math.ceil(total / limit), planCounts });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, plan, role } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Prevent changing super admin's role
  const targetUser = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (targetUser?.email === "rajeshsachin786@gmail.com" && role) {
    return NextResponse.json({ error: "Cannot change super admin role" }, { status: 403 });
  }

  const updateData: Record<string, string> = {};
  if (plan) updateData.plan = plan;
  if (role && ["candidate", "recruiter", "viewer", "admin"].includes(role)) {
    updateData.role = role;
  }

  await db.user.update({ where: { id: userId }, data: updateData });
  return NextResponse.json({ success: true });
}
