"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock, DollarSign, Loader2, RefreshCw, XCircle,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ── Types (agent-service GET /admin/runs) ────────────────────────
interface Stats {
  runs: number; failed: number; error_rate: number;
  p50_ms: number | null; p95_ms: number | null; cost_usd: number; tokens: number;
}
interface Day { date: string; ok: number; failed: number; cost_usd: number; p95_ms: number | null }
interface AgentRow extends Stats { agent: string; version: string | null; last_run: string }
interface Failure { at: string; agent: string; status: string; ms: number; version: string | null; request_id: string | null }
interface History {
  days: number; truncated: boolean; totals: Stats; statuses: Record<string, number>;
  daily: Day[]; agents: AgentRow[]; recent_failures: Failure[];
}

const RANGES = [1, 7, 30, 90];

const STATUS_LABEL: Record<string, string> = {
  ok: "Succeeded",
  error: "Error",
  timeout: "Timed out",
  budget_exceeded: "Over budget",
  loop_limit: "Loop limit",
  agent_unavailable: "Switched off / paused",
};

// ── Formatting ───────────────────────────────────────────────────
const fmtMs = (ms: number | null) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const fmtUsd = (v: number) => (v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
const fmtPct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 1 : 0)}%`;
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

// ── Chart pieces ─────────────────────────────────────────────────
const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

/** Bar with a 4px rounded top only when it is the topmost segment, and a 2px surface gap. */
function StackSegment(props: {
  x?: number; y?: number; width?: number; height?: number; fill?: string; dataKey?: string; payload?: Day;
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill, dataKey, payload } = props;
  if (height <= 0) return null;
  const isTop = dataKey === "failed" || !payload?.failed;
  const r = isTop ? Math.min(4, width / 2, height) : 0;
  const d = `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
  return <path d={d} fill={fill} stroke="hsl(var(--card))" strokeWidth={2} />;
}

function ChartTooltip({ active, payload, label, rows }: {
  active?: boolean; label?: string;
  payload?: { payload: Day }[];
  rows: { label: string; color: string; value: (d: Day) => string }[];
}) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label ? fmtDay(label) : ""}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
          {r.label}: <span className="font-medium text-foreground">{r.value(day)}</span>
        </p>
      ))}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === "ok";
  const Icon = ok ? CheckCircle2 : status === "timeout" ? Clock : status === "agent_unavailable" ? AlertTriangle : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${ok ? "text-muted-foreground" : "text-foreground"}`}>
      <Icon className="h-3.5 w-3.5" style={{ color: ok ? "var(--viz-ok)" : "var(--viz-fail)" }} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function AgentHealthPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/agent-runs?days=${range}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load run history");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load run history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.role !== "admin") { router.replace("/dashboard"); return; }
    load(days);
  }, [status, session, days, load, router]);

  const t = data?.totals;
  const failedStatuses = Object.entries(data?.statuses ?? {}).filter(([s]) => s !== "ok");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Admin
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6 text-violet-400" /> Agent health
          </h1>
          <p className="mt-1 text-muted-foreground">Every AI agent run: did it work, how fast, what it cost.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)} aria-pressed={days === r}
                className={`rounded px-3 py-1 text-xs transition-colors ${days === r ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {r === 1 ? "Today" : `${r} days`}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => load(days)} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !data && (
        <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading… the agent service may be waking up (free tier), which can take up to a minute.
        </CardContent></Card>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {data && t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Activity className="h-3.5 w-3.5" />} label="Runs" value={t.runs.toLocaleString()}
              sub={`${t.failed} failed`} />
            <Tile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Success rate"
              value={t.runs ? fmtPct(1 - t.error_rate) : "—"}
              sub={failedStatuses.length ? failedStatuses.map(([s, n]) => `${STATUS_LABEL[s] ?? s} ${n}`).join(" · ") : "no failures"} />
            <Tile icon={<Clock className="h-3.5 w-3.5" />} label="p95 latency" value={fmtMs(t.p95_ms)}
              sub={`median ${fmtMs(t.p50_ms)}`} />
            <Tile icon={<DollarSign className="h-3.5 w-3.5" />} label="LLM cost" value={fmtUsd(t.cost_usd)}
              sub={`${t.tokens.toLocaleString()} tokens`} />
          </div>

          {t.runs === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              No agent runs in this period yet. Runs are recorded from the moment run history was deployed.
            </CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Runs per day</CardTitle>
                  <div className="flex items-center gap-4">
                    <LegendItem color="var(--viz-ok)" label="Succeeded" />
                    <LegendItem color="var(--viz-fail)" label="Failed" />
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tickFormatter={fmtDay} tick={axisTick} tickLine={false} axisLine={false}
                        minTickGap={16} />
                      <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={40} />
                      <Tooltip cursor={{ fill: "hsl(var(--secondary))", opacity: 0.5 }}
                        content={<ChartTooltip rows={[
                          { label: "Succeeded", color: "var(--viz-ok)", value: (d) => String(d.ok) },
                          { label: "Failed", color: "var(--viz-fail)", value: (d) => String(d.failed) },
                        ]} />} />
                      <Bar dataKey="ok" stackId="runs" fill="var(--viz-ok)" maxBarSize={32} shape={<StackSegment />} isAnimationActive={false} />
                      <Bar dataKey="failed" stackId="runs" fill="var(--viz-fail)" maxBarSize={32} shape={<StackSegment />} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">LLM cost per day (USD)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.daily} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tickFormatter={fmtDay} tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
                        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => fmtUsd(v)} />
                        <Tooltip cursor={{ fill: "hsl(var(--secondary))", opacity: 0.5 }}
                          content={<ChartTooltip rows={[{ label: "Cost", color: "var(--viz-series)", value: (d) => fmtUsd(d.cost_usd) }]} />} />
                        <Bar dataKey="cost_usd" fill="var(--viz-series)" maxBarSize={32} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">p95 latency per day</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={data.daily} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tickFormatter={fmtDay} tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
                        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => fmtMs(v)} />
                        <Tooltip cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
                          content={<ChartTooltip rows={[{ label: "p95", color: "var(--viz-series)", value: (d) => fmtMs(d.p95_ms) }]} />} />
                        <Line dataKey="p95_ms" stroke="var(--viz-series)" strokeWidth={2} connectNulls={false}
                          dot={{ r: 4, fill: "var(--viz-series)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                          activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <div>
                <button onClick={() => setShowTable((v) => !v)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {showTable ? "Hide" : "Show"} daily numbers as a table
                </button>
                {showTable && (
                  <div className="mt-2 overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-xs text-muted-foreground">
                        <tr><th className="px-3 py-2 text-left font-medium">Day</th>
                          <th className="px-3 py-2 text-right font-medium">Succeeded</th>
                          <th className="px-3 py-2 text-right font-medium">Failed</th>
                          <th className="px-3 py-2 text-right font-medium">Cost</th>
                          <th className="px-3 py-2 text-right font-medium">p95</th></tr>
                      </thead>
                      <tbody>
                        {data.daily.map((d) => (
                          <tr key={d.date} className="border-t border-border">
                            <td className="px-3 py-1.5">{fmtDay(d.date)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{d.ok}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{d.failed}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtUsd(d.cost_usd)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtMs(d.p95_ms)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">By agent</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3 text-left font-medium">Agent</th>
                        <th className="px-3 py-2 text-right font-medium">Runs</th>
                        <th className="px-3 py-2 text-right font-medium">Failed</th>
                        <th className="px-3 py-2 text-right font-medium">Median</th>
                        <th className="px-3 py-2 text-right font-medium">p95</th>
                        <th className="px-3 py-2 text-right font-medium">Cost</th>
                        <th className="px-3 py-2 text-left font-medium">Version</th>
                        <th className="py-2 pl-3 text-left font-medium">Last run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agents.map((a) => (
                        <tr key={a.agent} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-medium">{a.agent}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.runs}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {a.failed > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <XCircle className="h-3.5 w-3.5" style={{ color: "var(--viz-fail)" }} />
                                {a.failed} ({fmtPct(a.error_rate)})
                              </span>
                            ) : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMs(a.p50_ms)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMs(a.p95_ms)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(a.cost_usd)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{a.version ?? "—"}</td>
                          <td className="py-2 pl-3 text-xs text-muted-foreground">{fmtTime(a.last_run)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent failures</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  {data.recent_failures.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No failed runs in this period.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="py-2 pr-3 text-left font-medium">When</th>
                          <th className="px-3 py-2 text-left font-medium">Agent</th>
                          <th className="px-3 py-2 text-left font-medium">What happened</th>
                          <th className="px-3 py-2 text-right font-medium">After</th>
                          <th className="py-2 pl-3 text-left font-medium">Request id (Langfuse / logs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_failures.map((f, i) => (
                          <tr key={`${f.at}-${i}`} className="border-b border-border last:border-0">
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtTime(f.at)}</td>
                            <td className="px-3 py-2">{f.agent}</td>
                            <td className="px-3 py-2"><StatusBadge status={f.status} /></td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMs(f.ms)}</td>
                            <td className="py-2 pl-3 font-mono text-xs text-muted-foreground">{f.request_id ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
              {data.truncated && (
                <p className="text-xs text-muted-foreground">Showing the first 50,000 runs of this period.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
