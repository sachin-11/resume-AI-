import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getIP, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = `copilot-link-del:${session.user.id}:${getIP(req)}`;
  const rl = rateLimit(id, { limit: 15, windowMs: 60_000 });
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  const sessionId = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const res = await db.copilotLinkSession.deleteMany({
    where: { id: sessionId, userId: session.user.id },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
