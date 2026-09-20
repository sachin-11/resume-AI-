import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import bcrypt from "bcryptjs";

// GDPR Article 17 — Right to erasure ("right to be forgotten")
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { password } = await req.json();
    if (!password) return NextResponse.json({ error: "Password required to confirm deletion" }, { status: 400 });

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { password: true, stripeSubId: true, stripeCustomerId: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Require password confirmation (Google users skip this)
    if (user.password) {
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });
    }

    // Stop billing before deleting the account — best-effort, don't block
    // deletion on a Stripe hiccup, but don't silently leave a card charged either.
    if (user.stripeSubId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubId);
      } catch (err) {
        console.error("[USER_DELETE] Stripe subscription cancel failed:", err);
      }
    }
    if (user.stripeCustomerId) {
      try {
        await stripe.customers.del(user.stripeCustomerId);
      } catch (err) {
        console.error("[USER_DELETE] Stripe customer delete failed:", err);
      }
    }

    // Organization.owner has no onDelete cascade (Restrict by default) — an
    // org-owning user's delete would otherwise throw a bare FK error (P2003)
    // and silently never complete. Dissolve their org first (cascades to
    // TeamMember rows via TeamMember.org's onDelete: Cascade).
    await db.organization.deleteMany({ where: { ownerId: session.user.id } });

    // Cascade delete — Prisma handles remaining related records via onDelete: Cascade
    await db.user.delete({ where: { id: session.user.id } });

    return NextResponse.json({ success: true, message: "Account and all data permanently deleted." });
  } catch (err) {
    console.error("[USER_DELETE]", err);
    return NextResponse.json({ error: "Failed to delete account. Please try again or contact support." }, { status: 500 });
  }
}
