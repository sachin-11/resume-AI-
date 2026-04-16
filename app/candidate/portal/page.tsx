"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain, Loader2, LogOut, Trophy, TrendingUp, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, MessageSquare, Calendar,
  BarChart3, Lightbulb, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getScoreColor, formatDate } from "@/lib/utils";

interface FeedbackData {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
  strengths: string[];
  weakAreas: string[];
  improvementRoadmap: string[];
  summary: string;
  betterAnswers: Array<{ question: string; improvedAnswer: string; candidateAnswer?: string }>;
  createdAt: string;
}

interface InviteData {
  id: string;
  status: string;
  createdAt: string;
  campaign: { role: string; title: string; difficulty: string; roundType: string };
}

interface HistoryItem {
  invite: InviteData;
  feedback: FeedbackData | null;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between mb-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold ${getScoreColor(score)}`}>{score}/100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function CandidatePortalPage() {
  const router = useRouter();
  const [candidate, setCandidate] = useState<{ email: string; name: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/candidate/me")
      .then((r) => {
        if (r.status === 401) { router.push("/candidate/login"); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setCandidate(d.candidate);
        setHistory(d.history ?? []);
        // Auto-expand first completed
        const first = d.history?.find((h: HistoryItem) => h.feedback);
        if (first) setExpandedId(first.invite.id);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/candidate/auth", { method: "DELETE" });
    router.push("/candidate/login");
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
    </div>
  );

  const completedCount = history.filter((h) => h.feedback).length;
  const scores = history.filter((h) => h.feedback).map((h) => h.feedback!.overallScore);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;

  // Aggregate improvement roadmap from all feedbacks
  const allRoadmap = [...new Set(
    history.flatMap((h) => h.feedback?.improvementRoadmap ?? [])
  )].slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">Candidate Portal</p>
              <p className="text-xs text-muted-foreground">{candidate?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-red-400">
            <LogOut className="h-4 w-4 mr-1.5" /> Logout
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">
            Hello, {candidate?.name || candidate?.email?.split("@")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1">Here are your interview results and improvement tips.</p>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black text-violet-400">{completedCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Interviews</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-black ${getScoreColor(avgScore)}`}>{avgScore || "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">Avg Score</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-black ${getScoreColor(bestScore)}`}>{bestScore || "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">Best Score</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Improvement Roadmap (aggregated) ── */}
        {allRoadmap.length > 0 && (
          <Card className="border-violet-500/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-violet-400" /> Your Improvement Roadmap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {allRoadmap.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-400 text-[10px] font-bold">{i + 1}</span>
                    <p className="text-sm text-muted-foreground">{step}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* ── Interview History ── */}
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-400" /> Interview History
          </h2>

          {history.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">No interviews yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {history.map(({ invite, feedback }) => {
                const isExpanded = expandedId === invite.id;
                const grade = feedback
                  ? feedback.overallScore >= 85 ? "Excellent" : feedback.overallScore >= 70 ? "Pass"
                    : feedback.overallScore >= 55 ? "Decent" : "Needs Work"
                  : null;

                return (
                  <Card key={invite.id} className={feedback ? "border-border" : "border-dashed border-border/50"}>
                    {/* Summary row */}
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedId(isExpanded ? null : invite.id)}
                      disabled={!feedback}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            feedback ? "bg-violet-600/20" : "bg-secondary"
                          }`}>
                            {feedback
                              ? <Trophy className="h-5 w-5 text-violet-400" />
                              : <Calendar className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">{invite.campaign.role}</p>
                            <p className="text-xs text-muted-foreground">{invite.campaign.title} · {formatDate(invite.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {feedback ? (
                              <>
                                <span className={`text-lg font-black ${getScoreColor(feedback.overallScore)}`}>
                                  {feedback.overallScore}
                                </span>
                                <Badge variant={
                                  feedback.overallScore >= 70 ? "success" :
                                  feedback.overallScore >= 55 ? "warning" : "destructive"
                                }>{grade}</Badge>
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </>
                            ) : (
                              <Badge variant="secondary">{invite.status}</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </button>

                    {/* Expanded feedback */}
                    {isExpanded && feedback && (
                      <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                        {/* Score breakdown */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score Breakdown</p>
                          <ScoreBar label="Technical" score={feedback.technicalScore} />
                          <ScoreBar label="Communication" score={feedback.communicationScore} />
                          <ScoreBar label="Confidence" score={feedback.confidenceScore} />
                        </div>

                        {/* Summary */}
                        <div className="rounded-lg bg-secondary/50 px-4 py-3">
                          <p className="text-xs text-muted-foreground leading-relaxed">{feedback.summary}</p>
                        </div>

                        {/* Strengths & Weak areas */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-semibold text-green-400 mb-1.5 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Strengths
                            </p>
                            <ul className="space-y-1">
                              {feedback.strengths.slice(0, 3).map((s, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <span className="text-green-500 shrink-0">✓</span>{s}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-yellow-400 mb-1.5 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Improve
                            </p>
                            <ul className="space-y-1">
                              {feedback.weakAreas.slice(0, 3).map((w, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <span className="text-yellow-500 shrink-0">!</span>{w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Better answers */}
                        {(feedback.betterAnswers as Array<{ question: string; improvedAnswer: string; candidateAnswer?: string }>)?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-violet-400 mb-2 flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" /> Improved Answer Examples
                            </p>
                            <div className="space-y-2">
                              {(feedback.betterAnswers as Array<{ question: string; improvedAnswer: string; candidateAnswer?: string }>).slice(0, 2).map((ba, i) => (
                                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                                  <p className="text-xs font-medium">Q: {ba.question}</p>
                                  {ba.candidateAnswer && (
                                    <div className="border-l-2 border-muted pl-2">
                                      <p className="text-[10px] text-muted-foreground">Your answer:</p>
                                      <p className="text-xs text-muted-foreground">{ba.candidateAnswer}</p>
                                    </div>
                                  )}
                                  <div className="border-l-2 border-violet-500 pl-2">
                                    <p className="text-[10px] text-violet-400">Better answer:</p>
                                    <p className="text-xs text-muted-foreground">{ba.improvedAnswer}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
