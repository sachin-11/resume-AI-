import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json();

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone and OTP required" }, { status: 400 });
    }

    // Get latest unused OTP for this phone
    const otp = await db.phoneOtp.findFirst({
      where: { phone, used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "OTP expired or not found. Request a new one." }, { status: 400 });
    }

    // Max 5 attempts
    if (otp.attempts >= 5) {
      await db.phoneOtp.update({ where: { id: otp.id }, data: { used: true } });
      return NextResponse.json({ error: "Too many wrong attempts. Request a new OTP." }, { status: 400 });
    }

    if (otp.code !== code) {
      await db.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const remaining = 4 - otp.attempts;
      return NextResponse.json({ error: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` }, { status: 400 });
    }

    // Mark OTP as used
    await db.phoneOtp.update({ where: { id: otp.id }, data: { used: true } });

    // Update user's phone as verified (if logged in)
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      await db.user.update({
        where: { id: session.user.id },
        data: { phone, phoneVerified: true },
      });
    }

    return NextResponse.json({ success: true, verified: true });
  } catch (err) {
    console.error("[OTP_VERIFY]", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
