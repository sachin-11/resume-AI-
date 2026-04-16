import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uploadToS3 } from "@/lib/s3";
import { rateLimit, RATE_LIMITS, getIP, rateLimitResponse } from "@/lib/rate-limit";

// Public endpoint — receives audio blob from candidate, uploads to S3
export async function POST(req: NextRequest) {
  const rl = rateLimit(getIP(req), RATE_LIMITS.publicComplete);
  if (!rl.success) return rateLimitResponse(rl);
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const sessionId = formData.get("sessionId") as string | null;

    if (!audioFile || !sessionId) {
      return NextResponse.json({ error: "Missing audio or sessionId" }, { status: 400 });
    }

    // Max 50MB
    if (audioFile.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file too large (max 50MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const ext = audioFile.type.includes("ogg") ? "ogg" : audioFile.type.includes("mp4") ? "mp4" : "webm";
    const key = `interviews/audio/${sessionId}.${ext}`;

    await uploadToS3(key, buffer, audioFile.type || "audio/webm");

    // Save S3 key to DB
    await db.interviewSession.update({
      where: { id: sessionId },
      data: { audioKey: key },
    });

    return NextResponse.json({ success: true, key });
  } catch (err) {
    console.error("[AUDIO_UPLOAD]", err);
    return NextResponse.json({ error: "Failed to upload audio" }, { status: 500 });
  }
}
