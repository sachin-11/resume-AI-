"use client";
import { use, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Approval {
  id: string;
  status: "pending" | "approved" | "declined" | "expired";
  clientId: string;
  message: string;
  expiresAt: string;
  candidate: { name: string; role: string; campaign: string; score: number | null } | null;
  slot: { startsAt: string; durationMin: number } | null;
  outcome: { booked: boolean; emailSent: boolean; error?: string } | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Approval page for a booking an AI assistant (MCP client) asked for. Only a click here books it. */
export default function McpApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [a, setA] = useState<Approval | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/mcp/approvals/${id}`)
      .then(async (r) => (r.ok ? setA(await r.json()) : setError(r.status === 404 ? "This request was not found." : "Could not load it.")))
      .catch(() => setError("Could not load it."));
  }, [id]);

  async function decide(decision: "approve" | "decline") {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/mcp/approvals/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    });
    setBusy(false);
    if (r.ok) setA(await r.json());
    else setError("Could not save your decision.");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 py-6">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <ShieldCheck className="h-5 w-5 text-violet-400" /> Approve an AI assistant&apos;s request
      </h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!a && !error && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {a && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Book an interview{a.candidate ? ` with ${a.candidate.name}` : ""}</CardTitle>
            <p className="text-xs text-muted-foreground">Requested by MCP client <span className="font-mono">{a.clientId}</span></p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {a.candidate && (
              <p>{a.candidate.role} · {a.candidate.campaign}{a.candidate.score !== null ? ` · interview score ${a.candidate.score}` : ""}</p>
            )}
            {a.slot && (
              <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> {fmt(a.slot.startsAt)} IST · {a.slot.durationMin} min</p>
            )}
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <p className="mb-1 text-xs text-muted-foreground">Email the candidate will get</p>
              <p className="whitespace-pre-wrap">{a.message}</p>
            </div>

            {a.status === "pending" ? (
              <div className="flex gap-2 pt-2">
                <Button onClick={() => decide("approve")} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve &amp; book
                </Button>
                <Button variant="outline" onClick={() => decide("decline")} disabled={busy} className="gap-2">
                  <XCircle className="h-4 w-4" /> Decline
                </Button>
              </div>
            ) : (
              <p className="pt-2 font-medium">
                {a.status === "approved"
                  ? a.outcome?.booked
                    ? `Approved — booked${a.outcome.emailSent ? " and the candidate was emailed" : ""}.${a.outcome.error ? ` ${a.outcome.error}` : ""}`
                    : `Approved, but not booked: ${a.outcome?.error ?? "unknown error"}`
                  : a.status === "declined" ? "Declined — nothing was booked." : "This request expired."}
              </p>
            )}
            <p className="text-xs text-muted-foreground">You can go back to your AI assistant — it will see the result when it checks again.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
