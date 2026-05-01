/**
 * POST /api/interview/video-analysis
 * One webcam frame (base64 data URL) → coaching-style read on posture / gaze / presence.
 * Uses OpenAI vision when OPENAI_API_KEY is set.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

const SYSTEM = `You are an interview presence coach. You ONLY see a single still frame from a webcam during a job interview (not continuous video). Be honest about limits: one frame cannot prove sustained eye contact. Infer soft cues only when reasonable.
Return valid JSON only.`;

function userPrompt(): string {
  return `From this single interview webcam frame, estimate soft presence cues for a candidate.

Return ONLY JSON:
{
  "eyeContactScore": 72,
  "bodyLanguageScore": 68,
  "confidenceSummary": "Candidate confident body language dikh raha hai — shoulders relaxed, facing camera.",
  "signals": ["Appears facing the camera", "Posture looks engaged"],
  "coachingTip": "One short tip to improve on-camera presence."
}

Scores are 0-100 (rough estimates from one frame). If face not visible, set scores low and say so in confidenceSummary.`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageDataUrl, sessionId } = await req.json();

  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "imageDataUrl required (data:image/...)" }, { status: 400 });
  }

  if (sessionId) {
    const ok = await db.interviewSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
      select: { id: true },
    });
    if (!ok) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      skipped: true,
      message:
        "Video presence coaching needs OPENAI_API_KEY (vision). Camera preview still works.",
    });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 500,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt() },
              {
                type: "image_url",
                image_url: { url: imageDataUrl.slice(0, 500_000) },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[VIDEO_ANALYSIS]", err);
      return NextResponse.json({ error: "Vision model request failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw, {
      eyeContactScore: 50,
      bodyLanguageScore: 50,
      confidenceSummary: "Could not analyze frame in detail.",
      signals: [],
      coachingTip: "",
    });

    return NextResponse.json({ analysis: parsed });
  } catch (err) {
    console.error("[VIDEO_ANALYSIS]", err);
    return NextResponse.json({ error: "Video analysis failed" }, { status: 500 });
  }
}
