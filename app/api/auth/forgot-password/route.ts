import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    // Always return success to prevent email enumeration
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: true });

    // Invalidate old tokens
    await db.passwordResetToken.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Create new token — expires in 1 hour
    const reset = await db.passwordResetToken.create({
      data: {
        email,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetLink = `${appUrl}/reset-password?token=${reset.token}`;

    await sendPasswordResetEmail({ to: email, name: user.name ?? "", resetLink });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[FORGOT_PASSWORD]", err);
    return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 });
  }
}
