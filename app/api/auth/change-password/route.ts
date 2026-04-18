import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) return NextResponse.json({ error: "Both fields required" }, { status: 400 });
    if (newPassword.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Google-only users have empty password
    if (!user.password) return NextResponse.json({ error: "Password change not available for Google accounts" }, { status: 400 });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.user.update({ where: { id: session.user.id }, data: { password: hashed } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[CHANGE_PASSWORD]", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
