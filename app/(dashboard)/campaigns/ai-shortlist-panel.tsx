"use client";
import { useState } from "react";
import { Sparkles, Loader2, ShieldAlert, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { runAgentJob } from "@/lib/agentJobClient";

interface Assessed {
  id: string;
  name: string;
  rank?: number;
  composite: number;
  overall_score: number;
  fit_score: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  flags: string[];
  review_reasons: string[];
}

interface CommitteeReport {
  total: number;
  shortlistSize: number;
  shortlist: Assessed[];
  others: Assessed[];
  needsReview: Assessed[];
  policy: string;
}

/**
 * AI hiring committee for a campaign: every completed candidate is assessed in
 * parallel, ranked by explicit rules, and the recruiter confirms the shortlist.
 */
export function AiShortlistPanel({ campaignId, onConfirmed }: { campaignId: string; onConfirmed: () => void }) {
  const [size, setSize] = useState(5);
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [report, setReport] = useState<CommitteeReport | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showOthers, setShowOthers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setRunning(true); setError(""); setMessage(""); setReport(null); setStep(null);
    try {
      const job = await runAgentJob<{ report: CommitteeReport }>(
        () => fetch(`/api/campaigns/${campaignId}/ai-shortlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shortlistSize: size, jobDescription: jd.trim() || undefined }),
        }),
        (label) => setStep(label),
      );
      if (job.status === "failed" || !job.result) throw new Error(job.error ?? "The committee couldn't finish");
      setReport(job.result.report);
      setPicked(new Set(job.result.report.shortlist.map((c) => c.id)));   // suggested, not saved
    } catch (err) {
      setError(err instanceof Error ? err.message : "The committee couldn't finish");
    } finally {
      setRunning(false); setStep(null);
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (!report) return;
    setSaving(true); setError("");
    const all = [...report.shortlist, ...report.others, ...report.needsReview];
    const notes = Object.fromEntries(
      all.filter((c) => picked.has(c.id)).map((c) => [c.id, `AI committee: ${c.summary}`.slice(0, 500)]),
    );
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/shortlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteIds: [...picked], notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the shortlist");
      setMessage(`Shortlist saved — ${data.shortlisted} candidate(s).`);
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the shortlist");
    } finally {
      setSaving(false);
    }
  }

  function row(c: Assessed, tone: "pick" | "other" | "review") {
    return (
      <label key={c.id} className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${
        tone === "review" ? "border-yellow-500/30 bg-yellow-500/5" : "border-border"}`}>
        <input type="checkbox" className="mt-1" checked={picked.has(c.id)} onChange={() => toggle(c.id)}
          disabled={!picked.has(c.id) && picked.size >= 25} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {c.rank && <span className="font-semibold text-violet-400">#{c.rank}</span>}
            <span className="font-medium truncate">{c.name}</span>
            <span className="text-xs text-muted-foreground">
              composite {c.composite} · interview {c.overall_score} · fit {c.fit_score}
            </span>
            {c.flags.map((f) => <span key={f} className="text-xs text-yellow-500">⚠ {f}</span>)}
          </div>
          {c.summary && <p className="text-xs text-muted-foreground">{c.summary}</p>}
          {c.review_reasons.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-yellow-500">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> {c.review_reasons.join(" · ")}
            </p>
          )}
          {(c.strengths.length > 0 || c.concerns.length > 0) && (
            <p className="text-xs">
              {c.strengths.slice(0, 2).map((s) => <span key={s} className="text-green-500">+ {s} </span>)}
              {c.concerns.slice(0, 2).map((s) => <span key={s} className="text-red-400">− {s} </span>)}
            </p>
          )}
        </div>
      </label>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-violet-400" /> AI Hiring Committee
      </div>
      <p className="text-xs text-muted-foreground">
        Every completed candidate is assessed in parallel by an AI committee member, then ranked. Names and
        contact details are not shown to the AI. Nothing is saved until you confirm.
      </p>

      <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
        <Input type="number" min={1} max={25} value={size} disabled={running}
          onChange={(e) => setSize(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
          aria-label="Shortlist size" />
        <Textarea placeholder="Job description (optional — the campaign description is used otherwise)"
          value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-[40px] text-sm" disabled={running} />
      </div>
      <Button size="sm" onClick={run} disabled={running}>
        {running
          ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{step ? `${step}…` : "Starting the committee…"}</>
          : <><Sparkles className="h-4 w-4 mr-1" />Run AI committee</>}
      </Button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {report && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {report.total} candidates assessed · {report.shortlist.length} suggested · {report.needsReview.length} need review.
            <br />Policy: {report.policy}
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium">Suggested shortlist</p>
            {report.shortlist.length ? report.shortlist.map((c) => row(c, "pick"))
              : <p className="text-xs text-muted-foreground">No candidate qualified automatically.</p>}
          </div>

          {report.needsReview.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-yellow-500">Needs your review (never auto-shortlisted)</p>
              {report.needsReview.map((c) => row(c, "review"))}
            </div>
          )}

          {report.others.length > 0 && (
            <div className="space-y-2">
              <button className="flex items-center gap-1 text-sm font-medium" onClick={() => setShowOthers((v) => !v)}>
                Other candidates ({report.others.length})
                {showOthers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showOthers && report.others.map((c) => row(c, "other"))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={confirm} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Confirm shortlist ({picked.size})
            </Button>
            {message && <span className="text-sm text-green-500">{message}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
