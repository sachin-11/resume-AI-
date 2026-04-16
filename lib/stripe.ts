import Stripe from "stripe";

// Lazy init — only on server side
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return _stripe;
}

// Keep named export for convenience in API routes
export const stripe = {
  get customers() { return getStripe().customers; },
  get checkout() { return getStripe().checkout; },
  get billingPortal() { return getStripe().billingPortal; },
  get webhooks() { return getStripe().webhooks; },
  get subscriptions() { return getStripe().subscriptions; },
};

export type PlanId = "free" | "pro" | "enterprise";

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    interviews: 5,           // per month
    features: [
      "5 interviews/month",
      "Basic analytics",
      "3 question types",
      "Email feedback",
    ],
    color: "border-border",
    badge: "",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 19,               // per month
    interviews: Infinity,
    features: [
      "Unlimited interviews",
      "Advanced analytics & charts",
      "All question types + personas",
      "Audio recording (S3)",
      "ATS resume analysis",
      "Webhook integrations",
      "Priority support",
    ],
    color: "border-violet-500/40",
    badge: "Most Popular",
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    yearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 99,
    interviews: Infinity,
    features: [
      "Everything in Pro",
      "Team members (unlimited)",
      "Bulk interview campaigns",
      "Custom branding",
      "Dedicated support",
      "SLA guarantee",
      "Custom integrations",
    ],
    color: "border-yellow-500/40",
    badge: "Best Value",
    monthlyPriceId: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
  },
} as const;

// Check if user can create interview based on plan
export function canCreateInterview(plan: string, interviewsThisMonth: number): boolean {
  if (plan === "pro" || plan === "enterprise") return true;
  return interviewsThisMonth < 5; // free = 5/month
}

export function getRemainingInterviews(plan: string, interviewsThisMonth: number): number {
  if (plan === "pro" || plan === "enterprise") return Infinity;
  return Math.max(0, 5 - interviewsThisMonth);
}
