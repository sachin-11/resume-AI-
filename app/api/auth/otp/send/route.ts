import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateOtp, sendOtpSms } from "@/lib/sns";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
      return NextResponse.json(
        { error: "Enter a valid phone number with country code (e.g. +919876543210)" },
        { status: 400 }
      );
    }

    // Rate limit: max 3 OTPs per phone per 10 minutes
    const recentCount = await db.phoneOtp.count({
      where: {
        phone,
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
    });
    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please wait 10 minutes." },
        { status: 429 }
      );
    }

    const code = generateOtp();

    await db.phoneOtp.create({
      data: {
        phone,
        code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
      },
    });

    await sendOtpSms(phone, code);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[OTP_SEND]", err);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
