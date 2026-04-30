/**
 * POST /api/agents/market-intelligence
 * Resume market analysis — demand score, salary, skill gaps
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
  const AGENT_SECRET = process.env.AGENT_SECRET ?? "dev-secret-change-in-production";

  const { resumeId, targetRole, location, experienceYears } = await req.json();

  const resume = await db.resume.findFirst({
    where: { id: resumeId, userId: session.user.id },
    select: { rawText: true },
  });
  if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

  try {
    const res = await fetch(`${AGENT_URL}/market-intelligence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agent-secret": AGENT_SECRET },
      body: JSON.stringify({
        resume_text: resume.rawText,
        target_role: targetRole ?? null,
        location: location ?? "India",
        experience_years: experienceYears ?? 3,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent failed" }, { status: 500 });
  }
}
