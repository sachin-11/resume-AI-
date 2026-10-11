/**
 * GET    /api/oauth/connections          — AI apps (MCP clients) connected to your account
 * DELETE /api/oauth/connections?id=<f>   — disconnect one (revokes its refresh-token family)
 *
 * A connection = one refresh-token family (one consent). Access tokens already issued
 * stay valid until they expire (≤ 1 hour); no new ones can be obtained after this.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.oAuthRefreshToken.findMany({
    where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { familyId: true, clientId: true, clientName: true, scopes: true, createdAt: true, rotatedAt: true },
  });
  const first = await db.oAuthRefreshToken.groupBy({
    by: ["familyId"], where: { userId: session.user.id, familyId: { in: rows.map((r) => r.familyId) } }, _min: { createdAt: true },
  });
  const since = new Map(first.map((f) => [f.familyId, f._min.createdAt]));
  const live = rows.filter((r) => r.rotatedAt === null);   // the current token of each active family
  return NextResponse.json({
    connections: live.map((r) => ({
      id: r.familyId,
      clientName: r.clientName,
      clientId: r.clientId,
      scopes: r.scopes.filter((s) => s !== "offline_access"),
      connectedAt: (since.get(r.familyId) ?? r.createdAt).toISOString(),
      lastRefreshedAt: r.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const familyId = req.nextUrl.searchParams.get("id");
  if (!familyId) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { count } = await db.oAuthRefreshToken.updateMany({
    where: { familyId, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.info(JSON.stringify({ event: "oauth_disconnect", user_id: session.user.id, family_id: familyId, revoked: count,
                                at: new Date().toISOString() }));
  return NextResponse.json({ disconnected: count > 0 });
}
