/**
 * GET /api/agents
 * Lists all available LangGraph agents
 */
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    // /agents is a public catalogue on agent-service — no credentials needed.
    const res = await fetch(`${AGENT_URL}/agents`, {
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
