/**
 * POST /api/agents/learning-path
 * Generates personalized learning path from feedback weak areas
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
  const AGENT_SECRET = process.env.AGENT_SECRET ?? "dev-secret-change-in-production";

  const body = await req.json();

  try {
    const res = await fetch(`${AGENT_URL}/generate-learning-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agent-secret": AGENT_SECRET },
      body: JSON.stringify({
        weak_areas: body.weakAreas ?? [],
        current_skills: body.currentSkills ?? [],
        target_role: body.targetRole ?? "Software Developer",
        experience_level: body.experienceLevel ?? "mid",
        available_hours_per_week: body.hoursPerWeek ?? 10,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent failed" }, { status: 500 });
  }
}
