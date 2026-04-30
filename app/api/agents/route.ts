/**
 * GET /api/agents
 * Lists all available LangGraph agents
 */
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
const AGENT_SECRET = process.env.AGENT_SECRET ?? "dev-secret-change-in-production";

export async function GET() {
  try {
    const res = await fetch(`${AGENT_URL}/agents`, {
      headers: { "x-agent-secret": AGENT_SECRET },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      agents: [],
      error: "Agent service unavailable",
    });
  }
}
