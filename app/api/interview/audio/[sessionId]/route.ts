import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPresignedUrl } from "@/lib/s3";

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

    // Get the interview session audio key
    const interviewSession = await db.interviewSession.findUnique({
      where: { id: sessionId },
      select: { audioKey: true, userId: true },
    });

    if (!interviewSession?.audioKey) {
      return NextResponse.json({ error: "No audio recorded for this session" }, { status: 404 });
    }

    // Authorization check:
    // 1. User owns the session directly
    // 2. Session belongs to a candidate in user's campaign
    const isOwner = interviewSession.userId === session.user.id;

    if (!isOwner) {
      const campaignInvite = await db.candidateInvite.findFirst({
        where: {
          sessionId,
          campaign: { userId: session.user.id },
        },
      });
      if (!campaignInvite) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const url = await getPresignedUrl(interviewSession.audioKey, 3600);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[AUDIO_GET]", err);
    return NextResponse.json({ error: "Failed to get audio URL" }, { status: 500 });
  }
}
