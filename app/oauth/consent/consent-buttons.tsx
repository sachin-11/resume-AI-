"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConsentButtons({ request, clientName }: { request: string; clientName: string }) {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState("");

  async function decide(decision: "allow" | "deny") {
    setBusy(decision);
    setError("");
    const res = await fetch("/api/oauth/consent", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, decision }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.redirect) {
      setBusy(null);
      setError(data.error ?? "Something went wrong.");
      return;
    }
    window.location.assign(data.redirect);
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <Button onClick={() => decide("allow")} disabled={busy !== null}>
          {busy === "allow" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Allow {clientName}
        </Button>
        <Button variant="outline" onClick={() => decide("deny")} disabled={busy !== null}>Deny</Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  );
}
