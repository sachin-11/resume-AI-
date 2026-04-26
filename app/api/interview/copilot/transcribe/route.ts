import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";
import { getIP, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

/**
 * Transcribe a short WebM/ogg chunk from "Share this tab" (meeting tab audio) — desktop only flow.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = `copilot:tr:${session.user.id}:${getIP(req)}`;
  const rl = rateLimit(id, { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio") as File | null;
  // Very small blobs are almost never valid speech for Whisper; reduces "audio too short" noise
  if (!audio || audio.size < 800) {
    return NextResponse.json({ error: "Audio missing or too small" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio file too large" }, { status: 400 });
  }

  const lang = (formData.get("lang") as string) || "en";
  const safeLang = ["en", "hi", "es", "fr"].includes(lang) ? lang : "en";

  const buf = Buffer.from(await audio.arrayBuffer());
  const n = (audio.name ?? "").toLowerCase();
  const name =
    n.endsWith(".m4a") || n.endsWith(".mp4")
      ? "clip.m4a"
      : n.endsWith(".webm")
        ? "clip.webm"
        : n.endsWith(".ogg")
          ? "clip.ogg"
          : "clip.webm";

  try {
    const text = (await transcribeAudio(buf, name, safeLang)).trim();
    // 200 + empty: client skips (no log spam) — e.g. sub-second / silent segment
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[COPILOT_TRANSCRIBE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
