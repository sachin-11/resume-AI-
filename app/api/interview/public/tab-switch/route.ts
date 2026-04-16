import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, RATE_LIMITS, getIP, rateLimitResponse } from "@/lib/rate-limit";

type ViolationType = "tab_switch" | "multiple_faces" | "no_face" | "looking_away" | "noise_detected" | "copy_paste";

const FIELD_MAP: Record<ViolationType, string> = {
  tab_switch:      "tabSwitchCount",
  multiple_faces:  "multipleFacesCount",
  no_face:         "noFaceCount",
  looking_away:    "lookingAwayCount",
  noise_detected:  "noiseCount",
  copy_paste:      "copyPasteCount",
};

// Thresholds
const WARNING_THRESHOLD    = 5;   // 5+ total violations → warning
const SUSPICIOUS_THRESHOLD = 10;  // 10+ total violations → suspicious

function calcIntegrityFlag(session: {
  tabSwitchCount: number; multipleFacesCount: number; noFaceCount: number;
  lookingAwayCount: number; noiseCount: number; copyPasteCount: number;
}): string {
  const total =
    session.tabSwitchCount +
    session.multipleFacesCount +
    session.noFaceCount +
    session.lookingAwayCount +
    session.noiseCount +
    session.copyPasteCount;

  if (total >= SUSPICIOUS_THRESHOLD) return "suspicious";
  if (total >= WARNING_THRESHOLD)    return "warning";
  return "clean";
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(getIP(req), RATE_LIMITS.tabSwitch);
  if (!rl.success) return rateLimitResponse(rl);

  try {
    let body: { sessionId?: string; violationType?: string };
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const text = await req.text();
      body = JSON.parse(text);
    }

    const { sessionId, violationType = "tab_switch" } = body;
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const field = FIELD_MAP[violationType as ViolationType] ?? "tabSwitchCount";

    // Increment the violation count
    const updated = await db.interviewSession.update({
      where: { id: sessionId },
      data: { [field]: { increment: 1 } },
      select: {
        tabSwitchCount: true, multipleFacesCount: true, noFaceCount: true,
        lookingAwayCount: true, noiseCount: true, copyPasteCount: true,
        integrityFlag: true,
      },
    });

    // Recalculate integrity flag
    const newFlag = calcIntegrityFlag(updated);

    // Only update DB if flag changed (avoid unnecessary writes)
    if (newFlag !== updated.integrityFlag) {
      await db.interviewSession.update({
        where: { id: sessionId },
        data: { integrityFlag: newFlag },
      });
    }

    const totalViolations =
      updated.tabSwitchCount + updated.multipleFacesCount + updated.noFaceCount +
      updated.lookingAwayCount + updated.noiseCount + updated.copyPasteCount;

    return NextResponse.json({
      success: true,
      integrityFlag: newFlag,
      totalViolations,
    });
  } catch (err) {
    console.error("[VIOLATION]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
