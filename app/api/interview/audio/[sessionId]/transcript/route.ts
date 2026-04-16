import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { transcribeSession } from "@/lib/transcribe";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;

  // Verify ownership (via campaign)
  const interviewSession = await db.interviewSession.findFirst({
    where: {
      id: sessionId,
      OR: [
        { userId: session.user.id },
        { user: { teamMembership: { org: { ownerId: session.user.id } } } },
      ],
    },
    select: { audioKey: true, transcript: true },
  });

  if (!interviewSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!interviewSession.audioKey) return NextResponse.json({ error: "No audio recorded" }, { status: 404 });

  // Return cached transcript if exists
  if (interviewSession.transcript) {
    return NextResponse.json({ transcript: interviewSession.transcript, cached: true });
  }

  // Transcribe now
  const transcript = await transcribeSession(sessionId);
  if (!transcript) return NextResponse.json({ error: "Transcription failed" }, { status: 500 });

  return NextResponse.json({ transcript, cached: false });
}
