import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[STRIPE_WEBHOOK] Invalid signature:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        if (!userId || !planId) break;

        await db.user.update({
          where: { id: userId },
          data: {
            plan: planId,
            stripeSubId: session.subscription as string,
            planExpiresAt: null, // active subscription
          },
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        const planId = sub.metadata?.planId ?? "free";
        const isActive = sub.status === "active" || sub.status === "trialing";
        // current_period_end may not exist on all Stripe SDK versions
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

        await db.user.update({
          where: { id: userId },
          data: {
            plan: isActive ? planId : "free",
            stripeSubId: sub.id,
            planExpiresAt: isActive ? null : (periodEnd ? new Date(periodEnd * 1000) : null),
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

        await db.user.update({
          where: { id: userId },
          data: {
            plan: "free",
            stripeSubId: null,
            planExpiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
          },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        // Optionally notify user about failed payment
        console.warn("[STRIPE] Payment failed for customer:", customerId);
        break;
      }
    }
  } catch (err) {
    console.error("[STRIPE_WEBHOOK] Handler error:", err);
  }

  return NextResponse.json({ received: true });
}
