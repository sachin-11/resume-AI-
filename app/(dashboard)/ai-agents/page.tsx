"use client";
import { useState, useEffect } from "react";
import {
  Bot, Loader2, AlertCircle, ChevronDown, ChevronUp,
  Users, BookOpen, BarChart3, GitBranch,
  Copy, Check, ExternalLink, Star, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────
interface Resume { id: string; fileName: string; }
interface InterviewSession { id: string; title: string; role: string; status: string; }

const DAILY_OPS_TASKS: { value: string; label: string }[] = [
  { value: "morning_summary", label: "Morning task summary" },
  { value: "gmail_summarize", label: "Gmail / email summarize" },
  { value: "slack_whatsapp_summarize", label: "Slack / WhatsApp summarize" },
  { value: "jira_check", label: "Jira tickets check" },
  { value: "daily_standup", label: "Daily standup" },
  { value: "calendar_reminders", label: "Calendar reminders" },
  { value: "notes_organize", label: "Notes organize" },
  { value: "expense_tracking", label: "Expense tracking" },
  { value: "fitness_reminders", label: "Fitness / diet reminders" },
  { value: "coding_tasks", label: "Coding tasks" },
  { value: "github_pr_review", label: "GitHub PR review summary" },
  { value: "auto_document", label: "Auto document generation" },
  { value: "meeting_summary", label: "Meeting summary + actions" },
  { value: "followup_reminders", label: "Follow-up reminders" },
  { value: "learning_planner", label: "Daily learning planner" },
  { value: "research_news", label: "AI research / news summarize" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors">
      {copied ? <><Check className="h-3 w-3 text-green-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
    </button>
  );
}

// ── Agent Card ───────────────────────────────────────────────────
function AgentCard({
  icon: Icon, title, description, badge, color, children, logs, result,
}: {
  icon: React.ElementType; title: string; description: string;
  badge: string; color: string; children: React.ReactNode;
  logs?: string[]; result?: React.ReactNode;
}) {  const [showLogs, setShowLogs] = useState(false);
  return (
    <div className={`rounded-xl border bg-card overflow-hidden`} style={{ borderColor: color + "40" }}>
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: color + "20" }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{title}</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: color + "20", color }}>
                {badge}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {children}
      </div>

      {result && (
        <div className="border-t px-5 pb-5 pt-4 space-y-3" style={{ borderColor: color + "30" }}>
          {result}
        </div>
      )}

      {logs && logs.length > 0 && (
        <div className="border-t" style={{ borderColor: color + "20" }}>
          <button className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-muted-foreground hover:bg-accent/30 transition-colors"
            onClick={() => setShowLogs(!showLogs)}>
            <span className="flex items-center gap-1.5"><GitBranch className="h-3 w-3" />Agent Logs ({logs.length})</span>
            {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showLogs && (
            <div className="px-5 pb-4 space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground font-mono shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-muted-foreground">{log}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function AIAgentsPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [selectedResume, setSelectedResume] = useState("");
  const [selectedSession, setSelectedSession] = useState("");

  // Agent states
  const [screeningJD, setScreeningJD] = useState("");
  const [screeningGithub, setScreeningGithub] = useState("");
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [screeningResult, setScreeningResult] = useState<Record<string, unknown> | null>(null);
  const [screeningLogs, setScreeningLogs] = useState<string[]>([]);

  const [learningRole, setLearningRole] = useState("");
  const [learningHours, setLearningHours] = useState(10);
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningResult, setLearningResult] = useState<Record<string, unknown> | null>(null);
  const [learningLogs, setLearningLogs] = useState<string[]>([]);

  const [panelLoading, setPanelLoading] = useState(false);
  const [panelResult, setPanelResult] = useState<Record<string, unknown> | null>(null);
  const [panelLogs, setPanelLogs] = useState<string[]>([]);

  const [marketLocation, setMarketLocation] = useState("Bangalore");
  const [marketExp, setMarketExp] = useState(3);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketResult, setMarketResult] = useState<Record<string, unknown> | null>(null);
  const [marketLogs, setMarketLogs] = useState<string[]>([]);

  const [dailyTaskType, setDailyTaskType] = useState("morning_summary");
  const [dailyContext, setDailyContext] = useState("");
  const [dailyFocus, setDailyFocus] = useState("");
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyResult, setDailyResult] = useState<Record<string, unknown> | null>(null);
  const [dailyLogs, setDailyLogs] = useState<string[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/resume/list").then(r => r.json()).then(d => {
      setResumes(d.resumes ?? []);
      if (d.resumes?.length) setSelectedResume(d.resumes[0].id);
    });
    fetch("/api/interview/list").then(r => r.json()).then(d => {
      const completed = (d.sessions ?? []).filter((s: InterviewSession) => s.status === "completed");
      setSessions(completed);
      if (completed.length) setSelectedSession(completed[0].id);
    }).catch(() => {});
  }, []);

  function setError(key: string, msg: string) { setErrors(p => ({ ...p, [key]: msg })); }
  function clearError(key: string) { setErrors(p => ({ ...p, [key]: "" })); }

  // ── Agent runners ──────────────────────────────────────────────
  async function runScreening() {
    if (!selectedResume || !screeningJD.trim()) { setError("screening", "Select resume and paste JD"); return; }
    clearError("screening"); setScreeningLoading(true); setScreeningResult(null);
    const res = await fetch("/api/agents/screen-candidate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        resumeId: selectedResume, 
        jobDescription: screeningJD,
        githubUsername: screeningGithub.trim() || undefined
      }),
    });
    const data = await res.json();
    setScreeningLoading(false);
    if (!res.ok) { setError("screening", data.error ?? "Failed"); return; }
    setScreeningResult(data.report); setScreeningLogs(data.logs ?? []);
  }

  async function runLearningPath() {
    if (!selectedResume) { setError("learning", "Select a resume"); return; }
    clearError("learning"); setLearningLoading(true); setLearningResult(null);
    const res = await fetch("/api/agents/learning-path", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weakAreas: [], currentSkills: [],
        targetRole: learningRole || "Software Developer",
        experienceLevel: "mid", hoursPerWeek: learningHours,
        resumeId: selectedResume,
      }),
    });
    const data = await res.json();
    setLearningLoading(false);
    if (!res.ok) { setError("learning", data.error ?? "Failed"); return; }
    setLearningResult(data.plan); setLearningLogs(data.logs ?? []);
  }

  async function runPanelInterview() {
    if (!selectedSession) { setError("panel", "Select a completed interview session"); return; }
    clearError("panel"); setPanelLoading(true); setPanelResult(null);
    const res = await fetch("/api/agents/panel-interview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selectedSession, resumeId: selectedResume || undefined }),
    });
    const data = await res.json();
    setPanelLoading(false);
    if (!res.ok) { setError("panel", data.error ?? "Failed"); return; }
    setPanelResult(data.report); setPanelLogs(data.logs ?? []);
  }

  async function runMarketIntelligence() {
    if (!selectedResume) { setError("market", "Select a resume"); return; }
    clearError("market"); setMarketLoading(true); setMarketResult(null);
    const res = await fetch("/api/agents/market-intelligence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeId: selectedResume, location: marketLocation,
        experienceYears: marketExp, targetRole: learningRole || undefined,
      }),
    });
    const data = await res.json();
    setMarketLoading(false);
    if (!res.ok) { setError("market", data.error ?? "Failed"); return; }
    setMarketResult(data.report); setMarketLogs(data.logs ?? []);
  }

  async function runDailyOps() {
    if (!dailyContext.trim()) { setError("daily", "Paste emails, notes, chat export, tickets, or PR text"); return; }
    clearError("daily"); setDailyLoading(true); setDailyResult(null);
    const res = await fetch("/api/agents/daily-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskType: dailyTaskType,
        userContext: dailyContext,
        optionalFocus: dailyFocus,
      }),
    });
    const data = await res.json();
    setDailyLoading(false);
    if (!res.ok) { setError("daily", data.error ?? "Failed"); return; }
    setDailyResult(data.report); setDailyLogs(data.logs ?? []);
  }

  const RECOMMENDATION_COLOR: Record<string, string> = {
    shortlist: "#22c55e", maybe: "#eab308", reject: "#ef4444",
    hire: "#22c55e", strong_hire: "#22c55e", no_hire: "#ef4444", hold: "#eab308",
    strong_yes: "#22c55e", yes: "#3b82f6", no: "#ef4444",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-violet-500" /> AI Agents Hub
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          6 LangGraph agents — each with its own graph, nodes, and decision logic.
        </p>
      </div>

      {/* Global selectors */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Global Config</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Resume (used by all agents)</label>
            <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={selectedResume} onChange={e => setSelectedResume(e.target.value)}>
              <option value="">— Choose resume —</option>
              {resumes.map(r => <option key={r.id} value={r.id}>{r.fileName}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Interview Session (for Panel agent)</label>
            <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              <option value="">— Choose completed session —</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.title} ({s.role})</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Daily Ops Agent (full width) ── */}
        <div className="lg:col-span-2">
          <AgentCard icon={ClipboardList} title="Daily Ops Agent" badge="16 tasks"
            description="Summaries, standup, inbox-style digests — paste Gmail exports, Slack/Teams text, Jira lists, PR bodies, meeting notes (live OAuth optional later)"
            color="#06b6d4" logs={dailyLogs}
            result={dailyResult ? (
              <div className="space-y-3">
                {"error" in dailyResult && dailyResult.error ? (
                  <p className="text-sm text-red-400">{String(dailyResult.error)}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-500/90">
                          {String(dailyResult.taskLabel ?? dailyResult.taskType ?? "")}
                        </p>
                        <h4 className="text-base font-semibold">{String(dailyResult.title ?? "")}</h4>
                      </div>
                      <CopyButton text={JSON.stringify(dailyResult, null, 2)} />
                    </div>
                    {!!dailyResult.summary && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{String(dailyResult.summary)}</p>
                    )}
                    {(dailyResult.sections as Array<{ heading?: string; bullets?: string[] }>)?.length > 0 && (
                      <div className="space-y-2">
                        {(dailyResult.sections as Array<{ heading?: string; bullets?: string[] }>).map((sec, i) => (
                          <div key={i} className="rounded-lg border border-border/80 bg-background/50 p-3">
                            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">{String(sec.heading ?? "")}</p>
                            <ul className="mt-1 list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                              {(sec.bullets ?? []).map((b, j) => <li key={j}>{b}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                    {(dailyResult.actionItems as Array<Record<string, unknown>>)?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1">Action items</p>
                        <ul className="space-y-1">
                          {(dailyResult.actionItems as Array<Record<string, unknown>>).map((a, i) => (
                            <li key={i} className="text-xs text-muted-foreground border-l-2 border-cyan-500/40 pl-2">
                              <span className="font-medium text-foreground">{String(a.task ?? "")}</span>
                              {Boolean(a.owner || a.due) && (
                                <span className="text-[10px] text-muted-foreground"> — {String(a.owner ?? "")}{a.due != null && String(a.due) !== "" ? ` · ${String(a.due)}` : ""}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(dailyResult.followUpReminders as Array<Record<string, unknown>>)?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1">Follow-ups</p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {(dailyResult.followUpReminders as Array<Record<string, unknown>>).map((f, i) => (
                            <li key={i}>• {String(f.when ?? "")}: {String(f.what ?? "")}{f.channel ? ` (${String(f.channel)})` : ""}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(dailyResult.quickWins as string[])?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-green-500 mb-1">Quick wins</p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                          {(dailyResult.quickWins as string[]).map((q, i) => <li key={i}>{q}</li>)}
                        </ul>
                      </div>
                    )}
                    {(dailyResult.risksOrBlockers as string[])?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-500 mb-1">Risks / blockers</p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">{(dailyResult.risksOrBlockers as string[]).map((r, i) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : undefined}>
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Task type</label>
                  <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    value={dailyTaskType} onChange={e => setDailyTaskType(e.target.value)}>
                    {DAILY_OPS_TASKS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Focus / constraints (optional)</label>
                  <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="e.g. IST, no meetings after 5pm, project Alpha"
                    value={dailyFocus} onChange={e => setDailyFocus(e.target.value)} />
                </div>
              </div>
              <textarea rows={6} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y min-h-[120px]"
                placeholder="Paste content to process: email threads, Slack export, WhatsApp copy-paste, Jira tickets, calendar list, meeting notes, PR description + diff summary, expenses…"
                value={dailyContext} onChange={e => setDailyContext(e.target.value)} />
              {errors.daily && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.daily}</p>}
              <Button onClick={runDailyOps} disabled={dailyLoading} className="w-full gap-2 bg-cyan-600 hover:bg-cyan-700">
                {dailyLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Running Daily Ops…</> : <><ClipboardList className="h-4 w-4" />Run Daily Ops</>}
              </Button>
            </div>
          </AgentCard>
        </div>

        {/* ── Agent 1: Candidate Screening ── */}
        <AgentCard icon={Users} title="Candidate Screening" badge="GitHub Verified"
          description="Multi-source screening: Resume + GitHub repos + JD match"
          color="#22c55e" logs={screeningLogs}
          result={screeningResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-black" style={{ color: RECOMMENDATION_COLOR[(screeningResult.screeningDecision as string) ?? "maybe"] }}>
                    {screeningResult.overallRating as number}
                  </div>
                  <div className="text-xs text-muted-foreground">Rating</div>
                </div>
                <div>
                  <span className="text-sm font-bold capitalize px-3 py-1 rounded-full"
                    style={{ background: RECOMMENDATION_COLOR[(screeningResult.screeningDecision as string) ?? "maybe"] + "20", color: RECOMMENDATION_COLOR[(screeningResult.screeningDecision as string) ?? "maybe"] }}>
                    {(screeningResult.screeningDecision as string)?.toUpperCase()}
                  </span>
                  {!!screeningResult.githubUsername && (
                    <a href={`https://github.com/${String(screeningResult.githubUsername ?? "")}`} target="_blank" rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-400 hover:underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />GitHub
                    </a>
                  )}
                </div>
              </div>
              {(screeningResult.greenFlags as string[])?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-400 mb-1">✅ Green Flags</p>
                  {(screeningResult.greenFlags as string[]).map(f => <p key={f} className="text-xs text-muted-foreground">• {f}</p>)}
                </div>
              )}
              {(screeningResult.redFlags as string[])?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-400 mb-1">🚩 Red Flags</p>
                  {(screeningResult.redFlags as string[]).map(f => <p key={f} className="text-xs text-muted-foreground">• {f}</p>)}
                </div>
              )}
              {(screeningResult.githubVerifiedSkills as string[])?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-400 mb-1">GitHub Verified Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {(screeningResult.githubVerifiedSkills as string[]).map(s => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : undefined}>
          <div className="space-y-2">
            <textarea rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Paste job description here..."
              value={screeningJD} onChange={e => setScreeningJD(e.target.value)} />
            
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">GitHub Username (Optional Override)</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. sachin-11 (overrides resume)"
                value={screeningGithub} onChange={e => setScreeningGithub(e.target.value)} />
            </div>

            {errors.screening && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.screening}</p>}
            <Button onClick={runScreening} disabled={screeningLoading} className="w-full gap-2 bg-green-600 hover:bg-green-700">
              {screeningLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Screening...</> : <><Users className="h-4 w-4" />Screen Candidate</>}
            </Button>
          </div>
        </AgentCard>

        {/* ── Agent 2: Learning Path ── */}
        <AgentCard icon={BookOpen} title="Learning Path Agent" badge="Adaptive"
          description="Personalized week-by-week learning plan based on skill gaps"
          color="#8b5cf6" logs={learningLogs}
          result={learningResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-black text-violet-400">{learningResult.totalWeeks as number}</div>
                  <div className="text-xs text-muted-foreground">Weeks</div>
                </div>
                <div>
                  <p className="text-sm font-medium">{learningResult.targetRole as string}</p>
                  <p className="text-xs text-muted-foreground">{learningResult.totalHours as number} hours total • {learningResult.hoursPerWeek as number}h/week</p>
                </div>
              </div>
              {(learningResult.weeklyPlan as Array<Record<string, unknown>>)?.slice(0, 3).map((week, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-violet-400">{String(week.week ?? "")}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${String(week.priority) === "high" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                      {String(week.priority ?? "")}
                    </span>
                  </div>
                  <p className="text-xs font-medium">{String(week.topic ?? "")}</p>
                  {!!week.milestone && <p className="text-[10px] text-muted-foreground">🎯 {String(week.milestone ?? "")}</p>}
                </div>
              ))}
            </div>
          ) : undefined}>
          <div className="space-y-2">
            <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Target role (e.g. Senior Node.js Developer)"
              value={learningRole} onChange={e => setLearningRole(e.target.value)} />
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Hours/week available</label>
              <span className="text-sm font-bold text-violet-400">{learningHours}h</span>
            </div>
            <input type="range" min={5} max={40} step={5} value={learningHours}
              onChange={e => setLearningHours(Number(e.target.value))} className="w-full accent-violet-500" />
            {errors.learning && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.learning}</p>}
            <Button onClick={runLearningPath} disabled={learningLoading} className="w-full gap-2 bg-violet-600 hover:bg-violet-700">
              {learningLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating...</> : <><BookOpen className="h-4 w-4" />Generate Learning Path</>}
            </Button>
          </div>
        </AgentCard>

        {/* ── Agent 3: Panel Interview ── */}
        <AgentCard icon={Star} title="Panel Interview Agent" badge="3 Agents"
          description="Technical + HR + Domain experts evaluate simultaneously"
          color="#f59e0b" logs={panelLogs}
          result={panelResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-black" style={{ color: RECOMMENDATION_COLOR[(panelResult.panelRecommendation as string) ?? "hold"] }}>
                    {panelResult.panelScore as number}
                  </div>
                  <div className="text-xs text-muted-foreground">Panel Score</div>
                </div>
                <span className="text-sm font-bold capitalize px-3 py-1 rounded-full"
                  style={{ background: RECOMMENDATION_COLOR[(panelResult.panelRecommendation as string) ?? "hold"] + "20", color: RECOMMENDATION_COLOR[(panelResult.panelRecommendation as string) ?? "hold"] }}>
                  {(panelResult.panelRecommendation as string)?.replace("_", " ").toUpperCase()}
                </span>
              </div>
              {(panelResult.breakdown as Record<string, Record<string, unknown>>) && (
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(panelResult.breakdown as Record<string, Record<string, unknown>>).map(([agent, data]) => (
                    <div key={agent} className="rounded-lg border border-border p-2 text-center">
                      <div className="text-lg font-black text-amber-400">{(data.score as number) ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{agent}</div>
                      <div className="text-[10px] text-muted-foreground">{data.verdict as string}</div>
                    </div>
                  ))}
                </div>
              )}
              {(panelResult.panelNotes as string[])?.map((note, i) => (
                <p key={i} className="text-xs text-muted-foreground border-l-2 border-amber-500/40 pl-2">{note}</p>
              ))}
            </div>
          ) : undefined}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Uses the selected interview session above. Select a completed session to run panel evaluation.</p>
            {sessions.length === 0 && <p className="text-xs text-yellow-400">⚠️ No completed sessions found. Complete an interview first.</p>}
            {errors.panel && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.panel}</p>}
            <Button onClick={runPanelInterview} disabled={panelLoading || !selectedSession} className="w-full gap-2 bg-amber-600 hover:bg-amber-700">
              {panelLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Panel evaluating...</> : <><Star className="h-4 w-4" />Run Panel Interview</>}
            </Button>
          </div>
        </AgentCard>

        {/* ── Agent 4: Market Intelligence ── */}
        <AgentCard icon={BarChart3} title="Market Intelligence" badge="2025 Data"
          description="Demand score, salary range, skill gaps vs market"
          color="#3b82f6" logs={marketLogs}
          result={marketResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-black text-blue-400">{marketResult.demandScore as number}</div>
                  <div className="text-xs text-muted-foreground">Demand Score</div>
                </div>
                <div>
                  {(marketResult.salaryRange as Record<string, unknown>) && (
                    <p className="text-sm font-bold text-green-400">
                      ₹{((marketResult.salaryRange as Record<string, number>).min / 100000).toFixed(1)}L – ₹{((marketResult.salaryRange as Record<string, number>).max / 100000).toFixed(1)}L
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{marketResult.location as string} • {marketResult.experienceYears as number} yrs</p>
                </div>
              </div>
              {(marketResult.skillGaps as string[])?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-400 mb-1">Skills to Add for Market</p>
                  <div className="flex flex-wrap gap-1">
                    {(marketResult.skillGaps as string[]).slice(0, 6).map(s => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(marketResult.topCompaniesHiring as string[])?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-400 mb-1">Top Companies Hiring</p>
                  <p className="text-xs text-muted-foreground">{(marketResult.topCompaniesHiring as string[]).join(", ")}</p>
                </div>
              )}
              {(marketResult.actionPlan as Array<Record<string, unknown>>)?.slice(0, 2).map((action, i) => (
                <div key={i} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2">
                  <p className="text-xs font-medium">{String(action.action ?? "")}</p>
                  <p className="text-[10px] text-green-400">{String(action.impact ?? "")}</p>
                </div>
              ))}
            </div>
          ) : undefined}>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Location</label>
                <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Bangalore" value={marketLocation} onChange={e => setMarketLocation(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Experience (years)</label>
                <input type="number" min={0} max={30} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={marketExp} onChange={e => setMarketExp(Number(e.target.value))} />
              </div>
            </div>
            {errors.market && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.market}</p>}
            <Button onClick={runMarketIntelligence} disabled={marketLoading} className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
              {marketLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing...</> : <><BarChart3 className="h-4 w-4" />Analyze Market</>}
            </Button>
          </div>
        </AgentCard>

      </div>

      {/* Architecture diagram */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5" /> LangGraph Architecture
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs text-center">
          {[
            { name: "Resume Improve", nodes: "5 nodes", loop: "✓ Loop", color: "#7c3aed" },
            { name: "Candidate Screen", nodes: "4 nodes", loop: "GitHub API", color: "#22c55e" },
            { name: "Learning Path", nodes: "3 nodes", loop: "Resources", color: "#8b5cf6" },
            { name: "Panel Interview", nodes: "4 nodes", loop: "3 Agents", color: "#f59e0b" },
            { name: "Market Intel", nodes: "3 nodes", loop: "Salary Data", color: "#3b82f6" },
            { name: "Daily Ops", nodes: "2 nodes", loop: "Paste context", color: "#06b6d4" },
          ].map((a) => (
            <div key={a.name} className="rounded-lg border p-3 space-y-1" style={{ borderColor: a.color + "40" }}>
              <div className="font-semibold" style={{ color: a.color }}>{a.name}</div>
              <div className="text-muted-foreground">{a.nodes}</div>
              <div className="text-[10px] px-2 py-0.5 rounded-full inline-block" style={{ background: a.color + "20", color: a.color }}>{a.loop}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
