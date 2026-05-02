"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Zap, Settings, RefreshCw, Loader2, CheckCircle2, XCircle,
  ExternalLink, Trash2, Mail, ChevronDown, ChevronUp, Copy,
  Check, AlertCircle, Play, Pause, BarChart3, Briefcase,
  MapPin, DollarSign, Clock, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────
interface Resume { id: string; fileName: string; }
interface AutoApplyJob {
  id: string; jobTitle: string; company: string; location?: string;
  jobUrl?: string; salary?: string; jobType?: string;
  matchScore?: number; matchedSkills: string[]; missingSkills: string[];
  coverLetter?: string; hrEmail?: string; status: string;
  appliedAt?: string; emailSentAt?: string; createdAt: string;
  source: string;
}
interface Settings {
  resumeId?: string; targetRole: string; location: string;
  minMatchScore: number; autoEmailEnabled: boolean;
  companyName: string; dailyLimit: number; isActive: boolean;
  lastRunAt?: string;
}
interface Stats { found?: number; skipped?: number; applied?: number; email_sent?: number; interview?: number; offer?: number; rejected?: number; }

// ── Helpers ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  found:      { label: "Matched",    cls: "bg-blue-500/20 text-blue-400 border-blue-500/30",    icon: "🎯" },
  skipped:    { label: "Low Match",  cls: "bg-secondary text-muted-foreground border-border",   icon: "⏭️" },
  applied:    { label: "Applied",    cls: "bg-violet-500/20 text-violet-400 border-violet-500/30", icon: "📤" },
  email_sent: { label: "Email Sent", cls: "bg-green-500/20 text-green-400 border-green-500/30", icon: "✉️" },
  interview:  { label: "Interview",  cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: "🎤" },
  offer:      { label: "Offer 🎉",   cls: "bg-green-500/20 text-green-400 border-green-500/30", icon: "🏆" },
  rejected:   { label: "Rejected",   cls: "bg-red-500/20 text-red-400 border-red-500/30",       icon: "❌" },
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold ${score >= 70 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
        {score}%
      </span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors">
      {copied ? <><Check className="h-3 w-3 text-green-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
    </button>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function AutoApplyPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [jobs, setJobs] = useState<AutoApplyJob[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [settings, setSettings] = useState<Settings>({
    targetRole: "", location: "Bangalore", minMatchScore: 65,
    autoEmailEnabled: false, companyName: "", dailyLimit: 10, isActive: false,
  });
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ found: number; matched: number; source: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeFilter, setActiveFilter] = useState("found");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [hrEmailInput, setHrEmailInput] = useState<Record<string, string>>({});
  const [applyResult, setApplyResult] = useState<Record<string, { emailSent: boolean; status: string }>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resumesRes, settingsRes, jobsRes] = await Promise.all([
        fetch("/api/resume/list"),
        fetch("/api/auto-apply/settings"),
        fetch(`/api/auto-apply/jobs?status=${activeFilter}&limit=50`),
      ]);
      const [resumesData, settingsData, jobsData] = await Promise.all([
        resumesRes.json(), settingsRes.json(), jobsRes.json(),
      ]);
      setResumes(resumesData.resumes ?? []);
      if (settingsData.settings) setSettings(settingsData.settings);
      setJobs(jobsData.jobs ?? []);
      setStats(jobsData.stats ?? {});
    } catch (err) {
      console.error("[AUTO_APPLY] fetchAll error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await fetch("/api/auto-apply/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setShowSettings(false);
    } catch (err) {
      console.error("[AUTO_APPLY] saveSettings error:", err);
    } finally {
      setSavingSettings(false);
    }
  }

  async function runFetch() {
    if (!settings.targetRole) { setShowSettings(true); return; }
    setFetching(true); setFetchResult(null);
    try {
      const res = await fetch("/api/auto-apply/fetch-jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: settings.resumeId,
          targetRole: settings.targetRole,
          location: settings.location,
          minMatchScore: settings.minMatchScore,
          limit: settings.dailyLimit,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFetchResult(data);
        fetchAll();
      }
    } catch (err) {
      console.error("[AUTO_APPLY] runFetch error:", err);
    } finally {
      setFetching(false);
    }
  }

  async function oneClickApply(job: AutoApplyJob) {
    setApplyingId(job.id);
    const hrEmail = hrEmailInput[job.id]?.trim() || job.hrEmail?.trim() || "";
    const shouldSendEmail = !!hrEmail; // send email whenever HR email is provided

    const res = await fetch(`/api/auto-apply/jobs/${job.id}/one-click-apply`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hrEmail,
        sendEmail: shouldSendEmail, // always send if email provided
        tone: "professional",
      }),
    });
    const data = await res.json();
    setApplyingId(null);
    if (res.ok) {
      setApplyResult((p) => ({ ...p, [job.id]: { emailSent: data.emailSent, status: data.status } }));
      setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: data.status, coverLetter: data.coverLetter } : j));
      setStats((p) => ({ ...p, found: Math.max(0, (p.found ?? 0) - 1), [data.status]: (p[data.status as keyof Stats] ?? 0) + 1 }));
    } else {
      console.error("[ONE_CLICK_APPLY]", data.error);
    }
  }

  async function updateStatus(jobId: string, status: string) {
    await fetch(`/api/auto-apply/jobs/${jobId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, status } : j));
  }

  async function deleteJob(jobId: string) {
    await fetch(`/api/auto-apply/jobs/${jobId}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  const totalApplied = (stats.applied ?? 0) + (stats.email_sent ?? 0);
  const totalFound = stats.found ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-violet-500" /> Auto Job Apply Agent
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI fetches jobs → matches resume → generates cover letter → one-click apply
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)} className="gap-1">
            <Settings className="h-4 w-4" /> Configure
          </Button>
          <Button onClick={runFetch} disabled={fetching} className="gap-2 bg-violet-600 hover:bg-violet-700">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {fetching ? "Fetching jobs..." : "Fetch New Jobs"}
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="rounded-xl border border-violet-500/30 bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Settings className="h-4 w-4 text-violet-400" /> Agent Configuration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Target Role *</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. Senior Node.js Developer"
                value={settings.targetRole} onChange={(e) => setSettings({ ...settings, targetRole: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Location</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. Bangalore"
                value={settings.location} onChange={(e) => setSettings({ ...settings, location: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Resume</label>
              <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={settings.resumeId ?? ""} onChange={(e) => setSettings({ ...settings, resumeId: e.target.value || undefined })}>
                <option value="">— No resume (basic match) —</option>
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Your Name (for emails)</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Your full name"
                value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Min Match Score</label>
              <span className="text-sm font-bold text-violet-400">{settings.minMatchScore}%</span>
            </div>
            <input type="range" min={40} max={90} step={5} value={settings.minMatchScore}
              onChange={(e) => setSettings({ ...settings, minMatchScore: Number(e.target.value) })}
              className="w-full accent-violet-500" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>40% (More jobs)</span><span>65% (Balanced)</span><span>90% (Best only)</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Jobs per fetch</label>
              <span className="text-sm font-bold text-violet-400">{settings.dailyLimit}</span>
            </div>
            <input type="range" min={5} max={20} step={5} value={settings.dailyLimit}
              onChange={(e) => setSettings({ ...settings, dailyLimit: Number(e.target.value) })}
              className="w-full accent-violet-500" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.autoEmailEnabled}
              onChange={(e) => setSettings({ ...settings, autoEmailEnabled: e.target.checked })}
              className="accent-violet-500 w-4 h-4" />
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm">Auto-send email to HR when applying</span>
          </label>
          <div className="flex gap-2">
            <Button onClick={saveSettings} disabled={savingSettings} className="gap-2">
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Settings
            </Button>
            <Button variant="ghost" onClick={() => setShowSettings(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Matched", value: totalFound, color: "text-blue-400", icon: "🎯" },
          { label: "Applied", value: totalApplied, color: "text-violet-400", icon: "📤" },
          { label: "Interview", value: stats.interview ?? 0, color: "text-yellow-400", icon: "🎤" },
          { label: "Offers", value: stats.offer ?? 0, color: "text-green-400", icon: "🏆" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Fetch result banner */}
      {fetchResult && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-400">Jobs fetched!</p>
            <p className="text-xs text-muted-foreground">
              Found {fetchResult.found} jobs · {fetchResult.matched} match your criteria
              {fetchResult.source === "mock" && " (demo data — add JSEARCH_API_KEY for real jobs)"}
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-secondary p-1 overflow-x-auto">
        {Object.entries(STATUS_CONFIG).map(([key, val]) => (
          <button key={key} onClick={() => setActiveFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${activeFilter === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {val.icon} {val.label}
            {stats[key as keyof Stats] ? <span className="ml-1 text-[10px] bg-secondary rounded-full px-1.5">{stats[key as keyof Stats]}</span> : null}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
          <Briefcase className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground text-sm">
            {activeFilter === "found" ? "No matched jobs yet. Click \"Fetch New Jobs\" to start." : `No ${STATUS_CONFIG[activeFilter]?.label} jobs.`}
          </p>
          {activeFilter === "found" && (
            <Button onClick={runFetch} disabled={fetching} className="gap-2">
              <Zap className="h-4 w-4" /> Fetch Jobs Now
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.found;
            const isExpanded = expandedId === job.id;
            const result = applyResult[job.id];

            return (
              <div key={job.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Job header */}
                <div className="flex items-start gap-3 p-4 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}>
                  {/* Match score */}
                  <div className="flex flex-col items-center shrink-0 w-12">
                    <div className={`text-lg font-black ${(job.matchScore ?? 0) >= 70 ? "text-green-400" : (job.matchScore ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                      {job.matchScore ?? "—"}
                    </div>
                    <div className="text-[9px] text-muted-foreground">match</div>
                  </div>

                  {/* Job info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{job.jobTitle}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                        {sc.icon} {sc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium">{job.company}</span>
                      {job.location && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><MapPin className="h-3 w-3" />{job.location}</span>}
                      {job.salary && job.salary !== "Not disclosed" && <span className="text-xs text-green-400 flex items-center gap-0.5"><DollarSign className="h-3 w-3" />{job.salary}</span>}
                      {job.jobType && <span className="text-xs text-muted-foreground">{job.jobType}</span>}
                    </div>
                    {job.matchScore && <ScoreBar score={job.matchScore} />}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {job.jobUrl && (
                      <a href={job.jobUrl} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-violet-400 hover:bg-accent transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-accent transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Skills */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {job.matchedSkills.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-green-400 mb-1.5">✅ Matched Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {job.matchedSkills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{s}</span>)}
                          </div>
                        </div>
                      )}
                      {job.missingSkills.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-red-400 mb-1.5">❌ Missing Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {job.missingSkills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Cover letter */}
                    {job.coverLetter && (
                      <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-violet-400">Cover Letter</p>
                          <CopyButton text={job.coverLetter} />
                        </div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed line-clamp-6">{job.coverLetter}</pre>
                      </div>
                    )}

                    {/* One-click apply */}
                    {(job.status === "found" || job.status === "applied") && (
                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
                        <p className="text-xs font-semibold text-violet-400 flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5" /> One-Click Apply
                        </p>
                        <div className="flex gap-2">
                          <input
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="HR email (optional — for direct email)"
                            value={hrEmailInput[job.id] ?? job.hrEmail ?? ""}
                            onChange={(e) => setHrEmailInput((p) => ({ ...p, [job.id]: e.target.value }))}
                            type="email"
                          />
                        </div>
                        {result && (
                          <p className={`text-xs flex items-center gap-1 ${result.emailSent ? "text-green-400" : "text-violet-400"}`}>
                            {result.emailSent
                              ? <><CheckCircle2 className="h-3.5 w-3.5" />Email sent to HR successfully! ✅</>
                              : <><CheckCircle2 className="h-3.5 w-3.5" />Cover letter generated. Add HR email above to send email.</>}
                          </p>
                        )}
                        <Button
                          onClick={() => oneClickApply(job)}
                          disabled={applyingId === job.id}
                          className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
                        >
                          {applyingId === job.id
                            ? <><Loader2 className="h-4 w-4 animate-spin" />Applying...</>
                            : <><Send className="h-4 w-4" />Generate Cover Letter + Apply</>}
                        </Button>
                      </div>
                    )}

                    {/* Status update */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Update status:</span>
                      {["applied", "interview", "offer", "rejected"].map((s) => (
                        <button key={s} onClick={() => updateStatus(job.id, s)}
                          className={`text-xs px-2 py-1 rounded-lg border transition-all capitalize ${job.status === s ? STATUS_CONFIG[s].cls : "border-border text-muted-foreground hover:bg-accent"}`}>
                          {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* API key notice */}
      {!process.env.NEXT_PUBLIC_HAS_JSEARCH && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-400 space-y-1">
          <p className="font-semibold flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Using demo jobs</p>
          <p className="text-muted-foreground">Add <code className="bg-secondary px-1 rounded">JSEARCH_API_KEY</code> to .env for real job listings from JSearch API (free tier: 200 req/month at rapidapi.com)</p>
        </div>
      )}
    </div>
  );
}
