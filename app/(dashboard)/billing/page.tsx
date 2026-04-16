"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Zap, Crown, Building2, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PLANS } from "@/lib/stripe";

interface BillingStatus {
  plan: string;
  interviewsThisMonth: number;
  remaining: number | null;
  planExpiresAt: string | null;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free:       <Zap className="h-5 w-5" />,
  pro:        <Crown className="h-5 w-5" />,
  enterprise: <Building2 className="h-5 w-5" />,
};

export default function BillingPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const success = params.get("success");
  const canceled = params.get("canceled");

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .finally(() => setLoading(false));
  }, []);

  async function handleCheckout(planId: string) {
    setCheckoutLoading(planId);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, billing }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setCheckoutLoading(null);
  }

  async function handlePortal() {
    setPortalLoading(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setPortalLoading(false);
  }

  const currentPlan = status?.plan ?? "free";
  const usagePercent = status?.remaining !== null && status?.remaining !== undefined
    ? Math.round((status.interviewsThisMonth / 5) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plans</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription and usage</p>
      </div>

      {/* Success / Cancel banners */}
      {success && (
        <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3">
          <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
          <p className="text-sm text-green-400 font-medium">Payment successful! Your plan has been upgraded.</p>
        </div>
      )}
      {canceled && (
        <div className="flex items-center gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-400">Checkout canceled. No charges were made.</p>
        </div>
      )}

      {/* Current plan status */}
      {!loading && status && (
        <Card className={`${currentPlan === "pro" ? "border-violet-500/40" : currentPlan === "enterprise" ? "border-yellow-500/40" : "border-border"}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  currentPlan === "pro" ? "bg-violet-600" : currentPlan === "enterprise" ? "bg-yellow-600" : "bg-secondary"
                }`}>
                  {PLAN_ICONS[currentPlan]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg capitalize">{currentPlan} Plan</p>
                    {currentPlan !== "free" && <Badge variant="success">Active</Badge>}
                  </div>
                  {currentPlan === "free" ? (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{status.interviewsThisMonth}/5 interviews used this month</span>
                        <span>{status.remaining ?? 0} remaining</span>
                      </div>
                      <Progress value={usagePercent} className="h-1.5 w-48" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-0.5">Unlimited interviews</p>
                  )}
                </div>
              </div>
              {currentPlan !== "free" && (
                <Button variant="outline" onClick={handlePortal} disabled={portalLoading}>
                  {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Manage Subscription
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => setBilling("monthly")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${billing === "monthly" ? "bg-violet-600 text-white" : "border border-border text-muted-foreground hover:bg-accent"}`}>
          Monthly
        </button>
        <button onClick={() => setBilling("yearly")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${billing === "yearly" ? "bg-violet-600 text-white" : "border border-border text-muted-foreground hover:bg-accent"}`}>
          Yearly <span className="ml-1 text-xs text-green-400">Save 20%</span>
        </button>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["free", "pro", "enterprise"] as const).map((planId) => {
          const plan = PLANS[planId];
          const isCurrent = currentPlan === planId;
          const isUpgrade = planId !== "free" && currentPlan !== planId;

          return (
            <Card key={planId} className={`relative ${plan.color} ${isCurrent ? "ring-2 ring-violet-500/50" : ""}`}>
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full">{plan.badge}</span>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  {PLAN_ICONS[planId]}
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-3xl font-black">
                    {plan.price === 0 ? "Free" : `$${billing === "yearly" ? Math.round(plan.price * 0.8) : plan.price}`}
                  </span>
                  {plan.price > 0 && <span className="text-muted-foreground text-sm">/mo</span>}
                </div>
                {billing === "yearly" && plan.price > 0 && (
                  <p className="text-xs text-green-400">Billed ${Math.round(plan.price * 0.8 * 12)}/year</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button className="w-full" variant="outline" disabled>Current Plan</Button>
                ) : planId === "free" ? (
                  <Button className="w-full" variant="outline" disabled>Downgrade</Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleCheckout(planId)}
                    disabled={checkoutLoading === planId}
                  >
                    {checkoutLoading === planId
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : isUpgrade ? "Upgrade Now" : "Switch Plan"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader><CardTitle className="text-base">Frequently Asked Questions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { q: "What happens when I reach the free limit?", a: "You'll see a message when you try to create your 6th interview. Upgrade to Pro for unlimited access." },
            { q: "Can I cancel anytime?", a: "Yes. Cancel from the Manage Subscription portal. You'll keep access until the end of your billing period." },
            { q: "Is there a free trial for Pro?", a: "Yes — 7-day free trial on first Pro subscription. No credit card required to start." },
            { q: "What payment methods are accepted?", a: "All major credit/debit cards via Stripe. Secure and PCI-compliant." },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="text-sm font-medium">{q}</p>
              <p className="text-xs text-muted-foreground mt-1">{a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
