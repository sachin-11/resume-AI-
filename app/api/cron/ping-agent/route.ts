/**
 * GET /api/cron/ping-agent
 * Pings the Python agent service every 14 minutes to prevent Render cold start.
 * Set this up as a cron job in Vercel/Amplify or use an external cron service.
 */
import { NextResponse } from "next/server";

export async function GET() {
  const agentUrl = process.env.AGENT_SERVICE_URL;
  if (!agentUrl) return NextResponse.json({ skipped: true });

  try {
    const res = await fetch(`${agentUrl}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json({ pinged: true, status: data.status });
  } catch {
    return NextResponse.json({ pinged: false });
  }
}
