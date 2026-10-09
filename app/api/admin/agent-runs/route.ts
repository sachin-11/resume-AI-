/**
 * GET /api/admin/agent-runs?days=7
 * Agent run history for the admin "Agent health" dashboard — proxied from
 * agent-service's /admin/runs (daily runs/failures/cost/p95, per-agent health,
 * recent failures). Admins only, on both sides.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { agentHeaders } from "@/lib/agentAuth";
import { AGENT_URL } from "@/lib/copilot-agent";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 7));
  try {
    const res = await fetch(`${AGENT_URL}/admin/runs?days=${days}`, {
      headers: await agentHeaders({ id: session.user.id, orgId: session.user.orgId, role: session.user.role }),
      // A sleeping free-tier instance can take ~50s to wake up.
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.detail ?? "Agent service error" }, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Agent service unavailable" }, { status: 502 });
  }
}
