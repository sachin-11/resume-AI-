import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Verifies OTP without marking it used — used during registration flow
// The OTP is marked used only after successful account creation
export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json();

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone and OTP required" }, { status: 400 });
    }

    const otp = await db.phoneOtp.findFirst({
      where: { phone, used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "OTP expired or not found. Request a new one." }, { status: 400 });
    }

    if (otp.attempts >= 5) {
      await db.phoneOtp.update({ where: { id: otp.id }, data: { used: true } });
      return NextResponse.json({ error: "Too many wrong attempts. Request a new OTP." }, { status: 400 });
    }

    if (otp.code !== code) {
      await db.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const remaining = 4 - otp.attempts;
      return NextResponse.json({
        error: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
      }, { status: 400 });
    }

    // Mark as used
    await db.phoneOtp.update({ where: { id: otp.id }, data: { used: true } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[OTP_VERIFY_ONLY]", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
