import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password || password.length < 8) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const reset = await db.passwordResetToken.findUnique({ where: { token } });

    if (!reset || reset.used || reset.expiresAt < new Date()) {
      return NextResponse.json({ error: "Reset link is invalid or expired" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);

    await Promise.all([
      db.user.update({ where: { email: reset.email }, data: { password: hashed } }),
      db.passwordResetToken.update({ where: { token }, data: { used: true } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[RESET_PASSWORD]", err);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
