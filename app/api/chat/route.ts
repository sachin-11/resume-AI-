import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dbChat } from "@/lib/db-chat";
import { stripHtml } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { message, history } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

    // Sanitize input — strip HTML, limit length
    const cleanMessage = stripHtml(message).slice(0, 500);
    if (!cleanMessage) return NextResponse.json({ error: "Invalid message" }, { status: 400 });

    const answer = await dbChat(session.user.id, cleanMessage, history ?? []);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[CHAT]", err);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
