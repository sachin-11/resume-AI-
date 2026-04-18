"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowLeft, Trophy, Brain, MessageSquare, Zap,
  CheckCircle, AlertCircle, Shield, ShieldAlert, ShieldX,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getScoreColor } from "@/lib/utils";

interface Candidate {
  invite: { id: string; name: string | null; email: string; photoUrl: string | null };
  feedback: {
    overallScore: number; technicalScore: number;
    communicationScore: number; confidenceScore: number;
    strengths: string[]; weakAreas: string[]; summary: string;
  } | null;
  proctoring: {
    tabSwitches: number; integrityFlag: string;
    multipleFaces: number; lookingAway: number; copyPaste: number;
  } | null;
  answers: Array<{ question: string; answer: string | null }>;
}

interface Campaign { title: string; role: string; difficulty: string; roundType: string }

const SCORE_METRICS = [
  { key: "overallScore",       label: "Overall",       icon: Trophy,         color: "text-violet-400" },
  { key: "technicalScore",     label: "Technical",     icon: Brain,          color: "text-blue-400" },
  { key: "communicationScore", label: "Communication", icon: MessageSquare,  color: "text-green-400" },
  { key: "confidenceScore",    label: "Confidence",    icon: Zap,            color: "text-yellow-400" },
] as const;

function IntegrityBadge({ flag }: { flag: string }) {
  if (flag === "suspicious") return (
    <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
      <ShieldX className="h-3.5 w-3.5" /> Suspicious
    </span>
  );
  if (flag === "warning") return (
    <span className="flex items-center gap-1 text-xs text-yellow-400 font-semibold">
      <ShieldAlert className="h-3.5 w-3.5" /> Warning
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
      <Shield className="h-3.5 w-3.5" /> Clean
    </span>
  );
}

function CompareContent() {
  const params = useSearchParams();
  const router = useRouter();
  const campaignId = params.get("campaign");
  const ids = params.get("ids");

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!campaignId || !ids) { setError("Missing parameters"); setLoading(false); return; }
    fetch(`/api/campaigns/${campaignId}/compare?ids=${ids}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setCampaign(d.campaign);
        setCandidates(d.candidates);
      })
      .catch(() => setError("Failed to load comparison"))
      .finally(() => setLoading(false));
  }, [campaignId, ids]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-400">{error}</p>
      <Button variant="outline" className="mt-4" onClick={() => router.back()}>Go Back</Button>
    </div>
  );

  // Find best score for highlighting
  const bestScore = Math.max(...candidates.map((c) => c.feedback?.overallScore ?? 0));

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /> Back</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Candidate Comparison</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {campaign?.title} · {campaign?.role} · {candidates.length} candidates
          </p>
        </div>
      </div>

      {/* ── Candidate headers ── */}
      <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${candidates.length}, 1fr)` }}>
        {candidates.map((c) => {
          const isBest = c.feedback?.overallScore === bestScore && bestScore > 0;
          return (
            <Card key={c.invite.id} className={isBest ? "border-violet-500/60 ring-1 ring-violet-500/30" : ""}>
              <CardContent className="p-4 text-center space-y-2">
                {/* Photo or avatar */}
                {c.invite.photoUrl ? (
                  <img src={c.invite.photoUrl} alt={c.invite.name ?? c.invite.email}
                    className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-violet-500/40" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-violet-600/20 flex items-center justify-center mx-auto text-2xl font-bold text-violet-400">
                    {(c.invite.name || c.invite.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm">{c.invite.name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.invite.email}</p>
                </div>
                {isBest && <Badge className="bg-violet-600 text-white text-xs">🏆 Best Score</Badge>}
                {!c.feedback && <Badge variant="secondary" className="text-xs">No feedback yet</Badge>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Score comparison ── */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-violet-400" /> Score Breakdown
        </CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {SCORE_METRICS.map(({ key, label, icon: Icon, color }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${candidates.length}, 1fr)` }}>
                {candidates.map((c) => {
                  const score = c.feedback?.[key] ?? null;
                  const isHighest = score !== null && score === Math.max(...candidates.map((x) => x.feedback?.[key] ?? 0));
                  return (
                    <div key={c.invite.id} className={`rounded-lg p-3 ${isHighest ? "bg-violet-500/10 border border-violet-500/30" : "bg-secondary/30"}`}>
                      {score !== null ? (
                        <>
                          <p className={`text-xl font-black ${getScoreColor(score)} ${isHighest ? "text-violet-400" : ""}`}>
                            {score}<span className="text-xs text-muted-foreground font-normal">/100</span>
                          </p>
                          <Progress value={score} className="h-1.5 mt-1.5" />
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Integrity / Proctoring ── */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" /> Integrity Check
        </CardTitle></CardHeader>
        <CardContent>
          <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${candidates.length}, 1fr)` }}>
            {candidates.map((c) => (
              <div key={c.invite.id} className="rounded-lg bg-secondary/30 p-3 space-y-2">
                {c.proctoring ? (
                  <>
                    <IntegrityBadge flag={c.proctoring.integrityFlag} />
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Tab switches: <span className={c.proctoring.tabSwitches > 2 ? "text-red-400" : "text-foreground"}>{c.proctoring.tabSwitches}</span></p>
                      <p>Multiple faces: <span className={c.proctoring.multipleFaces > 0 ? "text-red-400" : "text-foreground"}>{c.proctoring.multipleFaces}</span></p>
                      <p>Looking away: <span className={c.proctoring.lookingAway > 3 ? "text-yellow-400" : "text-foreground"}>{c.proctoring.lookingAway}</span></p>
                      <p>Copy-paste: <span className={c.proctoring.copyPaste > 0 ? "text-red-400" : "text-foreground"}>{c.proctoring.copyPaste}</span></p>
                    </div>
                  </>
                ) : <p className="text-xs text-muted-foreground">No data</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Strengths & Weak Areas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" /> Strengths
          </CardTitle></CardHeader>
          <CardContent>
            <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${candidates.length}, 1fr)` }}>
              {candidates.map((c) => (
                <div key={c.invite.id}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 truncate">{c.invite.name || c.invite.email}</p>
                  {c.feedback?.strengths.length ? (
                    <ul className="space-y-1">
                      {c.feedback.strengths.slice(0, 3).map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-green-500 shrink-0 mt-0.5">✓</span>{s}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">—</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" /> Areas to Improve
          </CardTitle></CardHeader>
          <CardContent>
            <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${candidates.length}, 1fr)` }}>
              {candidates.map((c) => (
                <div key={c.invite.id}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 truncate">{c.invite.name || c.invite.email}</p>
                  {c.feedback?.weakAreas.length ? (
                    <ul className="space-y-1">
                      {c.feedback.weakAreas.slice(0, 3).map((w, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-yellow-500 shrink-0 mt-0.5">!</span>{w}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">—</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── AI Summary ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">AI Summary</CardTitle></CardHeader>
        <CardContent>
          <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${candidates.length}, 1fr)` }}>
            {candidates.map((c) => (
              <div key={c.invite.id} className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs font-medium mb-1.5 truncate">{c.invite.name || c.invite.email}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {c.feedback?.summary ?? "No feedback available"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Q&A Comparison ── */}
      {candidates[0]?.answers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Answer Comparison</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {candidates[0].answers.map((qa, qi) => (
              <div key={qi} className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Q{qi + 1}: {qa.question}</p>
                <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${candidates.length}, 1fr)` }}>
                  {candidates.map((c) => (
                    <div key={c.invite.id} className="rounded-lg border border-border p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">{c.invite.name || c.invite.email}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {c.answers[qi]?.answer ?? <span className="italic">Not answered</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <CompareContent />
    </Suspense>
  );
}
