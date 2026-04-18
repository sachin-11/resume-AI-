import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// GDPR Article 17 — Right to erasure ("right to be forgotten")
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json();
  if (!password) return NextResponse.json({ error: "Password required to confirm deletion" }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Require password confirmation (Google users skip this)
  if (user.password) {
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });
  }

  // Cascade delete — Prisma handles related records via onDelete: Cascade
  await db.user.delete({ where: { id: session.user.id } });

  return NextResponse.json({ success: true, message: "Account and all data permanently deleted." });
}
