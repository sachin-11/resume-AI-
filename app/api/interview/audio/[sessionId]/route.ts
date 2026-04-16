import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPresignedUrl } from "@/lib/s3";

// Auth-protected — returns presigned S3 URL for audio playback
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;

    const interviewSession = await db.interviewSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
      select: { audioKey: true },
    });

    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!interviewSession.audioKey) {
      return NextResponse.json({ error: "No audio recorded" }, { status: 404 });
    }

    const url = await getPresignedUrl(interviewSession.audioKey, 3600);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[AUDIO_GET]", err);
    return NextResponse.json({ error: "Failed to get audio" }, { status: 500 });
  }
}
