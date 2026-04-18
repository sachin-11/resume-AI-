"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  BarChart3, FileText, MessageSquare, TrendingUp,
  Upload, ArrowRight, Loader2, Trophy, Users, Zap, Crown, CalendarDays,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatRelativeTime, getScoreColor } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────
interface Stats { totalInterviews: number; avgScore: number; totalResumes: number; lastActivity: string | null }
interface Trend { date: string; score: number; technical: number; communication: number; confidence: number }
interface ByRole { role: string; avg: number; count: number }
interface ByDiff { difficulty: string; avg: number; count: number }
interface CampaignStat { name: string; role: string; pass: number; fail: number; avg: number; total: number }
interface TopCandidate { title: string; role: string; difficulty: string; overallScore: number; technicalScore: number; communicationScore: number; date: string }

const DIFF_COLOR: Record<string, string> = { beginner: "#22c55e", intermediate: "#eab308", advanced: "#ef4444" };
const PIE_COLORS = ["#22c55e", "#ef4444"];

// ── Custom tooltip ───────────────────────────────────────────────
function ScoreTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [byRole, setByRole] = useState<ByRole[]>([]);
  const [byDifficulty, setByDifficulty] = useState<ByDiff[]>([]);
  const [campaignStats, setCampaignStats] = useState<CampaignStat[]>([]);
  const [topCandidates, setTopCandidates] = useState<TopCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [billingStatus, setBillingStatus] = useState<{ plan: string; remaining: number | null; used: number } | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activePreset, setActivePreset] = useState("");

  function load(from?: string, to?: string) {
    const f = from ?? dateFrom;
    const t = to ?? dateTo;
    setLoading(true); setError(false);
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString() ? `?${params}` : "";
    fetch(`/api/dashboard/stats${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats);
        setTrends(d.trends ?? []);
        setByRole(d.byRole ?? []);
        setByDifficulty(d.byDifficulty ?? []);
        setCampaignStats(d.campaignStats ?? []);
        setTopCandidates(d.topCandidates ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setBillingStatus({ plan: d.plan, remaining: d.remaining, used: d.interviewsThisMonth }))
      .catch(() => {});
  }

  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const statCards = [
    { title: "Total Interviews", value: stats?.totalInterviews ?? 0, icon: MessageSquare, color: "text-violet-500", bg: "bg-violet-500/10" },
    { title: "Avg Score", value: stats?.avgScore ? `${stats.avgScore}/100` : "N/A", icon: TrendingUp, color: getScoreColor(stats?.avgScore ?? 0), bg: "bg-green-500/10" },
    { title: "Resumes", value: stats?.totalResumes ?? 0, icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Last Activity", value: stats?.lastActivity ? formatRelativeTime(stats.lastActivity) : "Never", icon: BarChart3, color: "text-orange-500", bg: "bg-orange-500/10" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <p className="text-sm text-muted-foreground">Failed to load stats</p>
      <Button variant="outline" size="sm" onClick={() => load()}>Retry</Button>
    </div>
  );

  const hasData = trends.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {session?.user?.name?.split(" ")[0] ?? "there"} 👋</h1>
          <p className="text-muted-foreground mt-1">Your interview analytics overview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range filter */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                activePreset ? "border-violet-500 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {activePreset || "All time"}
              {activePreset && (
                <span onClick={(e) => { e.stopPropagation(); setActivePreset(""); setDateFrom(""); setDateTo(""); load("", ""); }}
                  className="ml-1 hover:text-red-400">✕</span>
              )}
            </button>

            {showDatePicker && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-border bg-card shadow-xl p-4 space-y-3">
                {/* Presets */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Quick Select</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Last 7 days", days: 7 },
                      { label: "Last 30 days", days: 30 },
                      { label: "Last 3 months", days: 90 },
                      { label: "Last 6 months", days: 180 },
                      { label: "This year", days: 365 },
                      { label: "All time", days: 0 },
                    ].map(({ label, days }) => (
                      <button key={label}
                        onClick={() => {
                          if (days === 0) {
                            setDateFrom(""); setDateTo(""); setActivePreset(""); load("", "");
                          } else {
                            const to = new Date();
                            const from = new Date(Date.now() - days * 86400000);
                            const fmt = (d: Date) => d.toISOString().split("T")[0];
                            setDateFrom(fmt(from)); setDateTo(fmt(to));
                            setActivePreset(label); load(fmt(from), fmt(to));
                          }
                          setShowDatePicker(false);
                        }}
                        className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-all text-left ${
                          activePreset === label
                            ? "border-violet-500 bg-violet-500/10 text-violet-400"
                            : "border-border hover:bg-accent text-muted-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom range */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Custom Range</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">From</p>
                      <input type="date" value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-violet-500" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">To</p>
                      <input type="date" value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-violet-500" />
                    </div>
                  </div>
                  <button
                    onClick={() => { setActivePreset("Custom"); load(dateFrom, dateTo); setShowDatePicker(false); }}
                    disabled={!dateFrom || !dateTo}
                    className="mt-2 w-full rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-3 py-1.5 text-xs text-white font-medium transition-colors"
                  >
                    Apply Custom Range
                  </button>
                </div>
              </div>
            )}
          </div>
          <Button asChild>
            <Link href="/interview/setup">Start Interview <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ title, value, icon: Icon, color, bg }) => (
          <Card key={title}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{title}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                </div>
                <div className={`rounded-lg p-2.5 ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Free Plan Usage Bar ── */}
      {billingStatus?.plan === "free" && (
        <div className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
          (billingStatus.remaining ?? 0) === 0 ? "border-red-500/40 bg-red-500/10" :
          (billingStatus.remaining ?? 0) <= 2 ? "border-yellow-500/40 bg-yellow-500/10" :
          "border-border bg-secondary/30"
        }`}>
          <Zap className={`h-4 w-4 shrink-0 ${(billingStatus.remaining ?? 0) === 0 ? "text-red-400" : "text-muted-foreground"}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">
                {(billingStatus.remaining ?? 0) === 0 ? "Monthly limit reached" : `${billingStatus.remaining} free interview${billingStatus.remaining !== 1 ? "s" : ""} left`}
              </span>
              <span className="text-xs text-muted-foreground">{billingStatus.used}/5 used</span>
            </div>
            <Progress value={(billingStatus.used / 5) * 100} className="h-1.5" />
          </div>
          <Link href="/billing">
            <button className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors shrink-0">
              <Crown className="h-3 w-3" /> Upgrade
            </button>
          </Link>
        </div>
      )}

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No interview data yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Complete interviews to see analytics</p>
            <Button asChild size="sm" className="mt-4"><Link href="/interview/setup">Start First Interview</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Score Trend ── */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-400" />Score Trends Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip content={<ScoreTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="score" name="Overall" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="technical" name="Technical" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="communication" name="Communication" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="confidence" name="Confidence" stroke="#eab308" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Row 2: By Role + By Difficulty ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Avg score by role */}
            {byRole.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-400" />Avg Score by Role</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byRole} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="role" tick={{ fontSize: 10, fill: "#94a3b8" }} width={90} />
                      <Tooltip content={<ScoreTooltip />} />
                      <Bar dataKey="avg" name="Avg Score" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Avg score by difficulty */}
            {byDifficulty.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-orange-400" />Avg Score by Difficulty</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byDifficulty} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis dataKey="difficulty" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip content={<ScoreTooltip />} />
                      <Bar dataKey="avg" name="Avg Score" radius={[4, 4, 0, 0]}>
                        {byDifficulty.map((entry) => (
                          <Cell key={entry.difficulty} fill={DIFF_COLOR[entry.difficulty] ?? "#7c3aed"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-3 justify-center mt-2">
                    {byDifficulty.map((d) => (
                      <div key={d.difficulty} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="w-2 h-2 rounded-full" style={{ background: DIFF_COLOR[d.difficulty] ?? "#7c3aed" }} />
                        {d.difficulty} ({d.count})
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Campaign Pass/Fail ── */}
          {campaignStats.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-green-400" />Campaign Pass / Fail Rate</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={campaignStats} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-20} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip content={<ScoreTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="pass" name="Pass (≥60)" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="a" />
                      <Bar dataKey="fail" name="Fail (<60)" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="space-y-3">
                    {campaignStats.map((c) => {
                      const passRate = c.total > 0 ? Math.round((c.pass / c.total) * 100) : 0;
                      return (
                        <div key={c.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate max-w-[160px]">{c.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">{c.pass}/{c.total}</span>
                              <span className={`text-xs font-bold ${passRate >= 60 ? "text-green-400" : "text-red-400"}`}>{passRate}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${passRate}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Top Performers ── */}
          {topCandidates.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-400" />Best Performing Sessions</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topCandidates.map((c, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-3">
                      {/* Rank */}
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                        i === 1 ? "bg-slate-400/20 text-slate-400" :
                        i === 2 ? "bg-orange-500/20 text-orange-400" : "bg-secondary text-muted-foreground"
                      }`}>
                        {i + 1}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.difficulty}</Badge>
                          <span className="text-xs text-muted-foreground">{c.date}</span>
                        </div>
                      </div>
                      {/* Scores */}
                      <div className="shrink-0 text-right">
                        <p className={`text-lg font-black ${getScoreColor(c.overallScore)}`}>{c.overallScore}</p>
                        <p className="text-[10px] text-muted-foreground">overall</p>
                      </div>
                      {/* Mini radar */}
                      <div className="shrink-0 hidden sm:block">
                        <ResponsiveContainer width={80} height={60}>
                          <RadarChart data={[
                            { s: "Tech", v: c.technicalScore },
                            { s: "Comm", v: c.communicationScore },
                            { s: "Conf", v: c.overallScore },
                          ]}>
                            <PolarGrid stroke="#1e1e2e" />
                            <PolarAngleAxis dataKey="s" tick={{ fontSize: 8, fill: "#64748b" }} />
                            <Radar dataKey="v" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.3} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: "/upload-resume", icon: Upload, color: "text-violet-500", bg: "bg-violet-500/10", title: "Upload Resume", sub: "Get AI analysis" },
          { href: "/interview/setup", icon: MessageSquare, color: "text-green-500", bg: "bg-green-500/10", title: "Mock Interview", sub: "Practice with AI" },
          { href: "/resume-report", icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10", title: "Resume Reports", sub: "View analysis" },
        ].map(({ href, icon: Icon, color, bg, title, sub }) => (
          <Link key={href} href={href} className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-accent transition-colors group">
            <div className={`rounded-lg p-2 ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
            <div className="flex-1">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
