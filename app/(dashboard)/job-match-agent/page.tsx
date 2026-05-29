"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Target, Zap, Loader2, AlertCircle, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, TrendingUp, Lightbulb, Mic, DollarSign,
  Compass, AlertTriangle, Sparkles, Building2, BookOpen, ThumbsUp,
  ThumbsDown, Clock, Users, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────
interface Resume { id: string; fileName: string; }

interface JDData {
  title: string; company: string;
  mustHave: string[]; niceToHave: string[];
  responsibilities: string[];
  redFlags: string[]; cultureSignals: string[];
}

interface MatchData {
  competitiveEdge: string[];
  criticalGaps: string[];
  optionalGaps: string[];
}

interface MockQuestion {
  question: string;
  type: "technical" | "behavioral" | "situational" | "culture_fit";
  model_answer: string;
  tips: string;
}

interface Salary {
  min: number; max: number; currency: string;
  factors: string[]; negotiationTip: string;
}

interface Strategy {
  overview: string; timing: string;
  referralTips: string[]; linkedinTips: string[];
  dos: string[]; donts: string[];
}

interface JobMatchReport {
  fitScore: number;
  fitVerdict: "strong_fit" | "good_fit" | "stretch" | "low_fit";
  matchSummary: string;
  jd: JDData;
  match: MatchData;
  mockInterview: MockQuestion[];
  salary: Salary;
  strategy: Strategy;
}

// ── Helpers ───────────────────────────────────────────────────────
const VERDICT_CONFIG = {
  strong_fit: { label: "Strong Fit",  color: "#22c55e", bg: "bg-green-500/10 border-green-500/30 text-green-400" },
  good_fit:   { label: "Good Fit",    color: "#3b82f6", bg: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  stretch:    { label: "Stretch",     color: "#eab308", bg: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" },
  low_fit:    { label: "Low Fit",     color: "#ef4444", bg: "bg-red-500/10 border-red-500/30 text-red-400" },
};

const QUESTION_TYPE_BADGE: Record<string, string> = {
  technical:    "bg-violet-500/20 text-violet-400 border-violet-500/30",
  behavioral:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  situational:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  culture_fit:  "bg-green-500/20 text-green-400 border-green-500/30",
};

function FitScoreRing({ score, verdict }: { score: number; verdict: string }) {
  const cfg = VERDICT_CONFIG[verdict as keyof typeof VERDICT_CONFIG] ?? VERDICT_CONFIG.stretch;
  const r = 44, circ = 2 * Math.PI * r, dash = (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg className="absolute" width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor"
          strokeWidth="6" className="text-border" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={cfg.color}
          strokeWidth="6" strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round" transform="rotate(-90 56 56)" />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-2xl font-black" style={{ color: cfg.color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function Chip({ label, variant = "default" }: { label: string; variant?: "green" | "red" | "yellow" | "blue" | "default" }) {
  const cls = {
    green:   "bg-green-500/10 text-green-400 border-green-500/20",
    red:     "bg-red-500/10 text-red-400 border-red-500/20",
    yellow:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    blue:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
    default: "bg-secondary text-muted-foreground border-border",
  }[variant];
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors">
        <span className="flex items-center gap-2 font-semibold text-sm">
          <Icon className="h-4 w-4 text-violet-400" />
          {title}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">{children}</div>}
    </div>
  );
}

function formatSalary(n: number, currency: string) {
  if (currency === "INR") {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    return `₹${n.toLocaleString("en-IN")}`;
  }
  return `$${(n / 1000).toFixed(0)}K`;
}

// ── Main Page ─────────────────────────────────────────────────────
export default function JobMatchAgentPage() {
  const [resumes, setResumes]             = useState<Resume[]>([]);
  const [resumeId, setResumeId]           = useState("");
  const [jobTitle, setJobTitle]           = useState("");
  const [company, setCompany]             = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [report, setReport]               = useState<JobMatchReport | null>(null);
  const [expandedQ, setExpandedQ]         = useState<number | null>(null);

  const fetchResumes = useCallback(async () => {
    const res  = await fetch("/api/resume/list");
    const data = await res.json();
    const list: Resume[] = data.resumes ?? [];
    setResumes(list);
    if (list.length > 0) setResumeId(list[0].id);
  }, []);

  useEffect(() => { fetchResumes(); }, [fetchResumes]);

  async function handleAnalyze() {
    if (!resumeId || !jobTitle.trim() || !jobDescription.trim()) {
      setError("Resume, job title, and job description are required."); return;
    }
    setError(""); setReport(null); setLoading(true); setExpandedQ(null);

    const res  = await fetch("/api/job-match-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeId, jobTitle, company: company || undefined, jobDescription }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Analysis failed. Make sure the agent service is running.");
      return;
    }
    setReport(data.report as JobMatchReport);
  }

  const verdict    = report ? (VERDICT_CONFIG[report.fitVerdict] ?? VERDICT_CONFIG.stretch) : null;
  const hasRedFlags = report && report.jd.redFlags.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-violet-500" /> Job Match Agent
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Deep fit analysis · Mock interview questions · Salary intelligence · Application strategy
        </p>
      </div>

      {/* Input Card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" /> Analyze Your Fit
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Resume */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Your Resume *</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={resumeId}
              onChange={(e) => setResumeId(e.target.value)}
            >
              {resumes.length === 0
                ? <option value="">No resumes — upload one first</option>
                : resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)
              }
            </select>
          </div>

          {/* Job Title */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Job Title *</label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. Senior Backend Engineer"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
        </div>

        {/* Company */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Company (optional)</label>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="e.g. Google, Flipkart, Startup Inc."
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>

        {/* Job Description */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Job Description * (paste full JD)</label>
          <textarea
            rows={7}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            placeholder="Paste the full job description here..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">{jobDescription.length} characters — minimum 50</p>
        </div>

        {error && (
          <p className="text-red-400 text-sm flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <Button
          onClick={handleAnalyze}
          disabled={loading || resumes.length === 0}
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
        >
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Running 6-step analysis...</>
            : <><Zap className="h-4 w-4" /> Run Deep Job Match Analysis</>
          }
        </Button>

        {loading && (
          <div className="space-y-1">
            <div className="flex gap-2 flex-wrap text-[11px] text-muted-foreground">
              {["Parsing JD", "Deep match", "Mock interview", "Salary intel", "Strategy", "Building report"].map((s, i) => (
                <span key={i} className="flex items-center gap-1 bg-secondary rounded-full px-2.5 py-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {report && (
        <div className="space-y-4">
          {/* Score Card */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <FitScoreRing score={report.fitScore} verdict={report.fitVerdict} />
              <div className="flex-1 space-y-3 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${verdict?.bg}`}>
                    {verdict?.label}
                  </span>
                  {report.jd.title && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {report.jd.title}{report.jd.company ? ` · ${report.jd.company}` : ""}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{report.matchSummary}</p>
                {/* Competitive edge chips */}
                {report.match.competitiveEdge.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-green-400 flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" /> Your Competitive Edge
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {report.match.competitiveEdge.map((e) => <Chip key={e} label={e} variant="green" />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* JD Intelligence */}
          <Section title="JD Intelligence" icon={BookOpen}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Must-haves */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Must-Have Requirements</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.jd.mustHave.map((s) => {
                    const isMissing = report.match.criticalGaps.some((g) => g.toLowerCase().includes(s.toLowerCase().slice(0, 5)));
                    return <Chip key={s} label={s} variant={isMissing ? "red" : "green"} />;
                  })}
                </div>
              </div>
              {/* Nice-to-haves */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nice-to-Have</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.jd.niceToHave.map((s) => <Chip key={s} label={s} variant="blue" />)}
                </div>
              </div>
            </div>

            {/* Culture Signals */}
            {report.jd.cultureSignals.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Culture Signals</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.jd.cultureSignals.map((s) => <Chip key={s} label={s} variant="yellow" />)}
                </div>
              </div>
            )}

            {/* Red Flags */}
            {hasRedFlags && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> JD Red Flags
                </p>
                <ul className="space-y-1">
                  {report.jd.redFlags.map((f) => (
                    <li key={f} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-red-400 mt-0.5 shrink-0">!</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {/* Skill Gaps */}
          <Section title="Skill Gap Analysis" icon={Target}>
            {report.match.criticalGaps.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Critical Gaps (must-have skills missing)
                </p>
                <ul className="space-y-1.5">
                  {report.match.criticalGaps.map((g) => (
                    <li key={g} className="text-sm text-muted-foreground flex items-start gap-2 rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2">
                      <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />{g}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> No critical gaps — you meet all must-have requirements!
              </p>
            )}

            {report.match.optionalGaps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Optional Gaps (nice-to-have skills missing)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {report.match.optionalGaps.map((g) => <Chip key={g} label={g} variant="yellow" />)}
                </div>
              </div>
            )}
          </Section>

          {/* Mock Interview */}
          <Section title={`Mock Interview (${report.mockInterview.length} targeted questions)`} icon={Mic} defaultOpen={false}>
            <p className="text-xs text-muted-foreground -mt-2">
              These questions are generated based on THIS specific role and your profile gaps.
            </p>
            <div className="space-y-2">
              {report.mockInterview.map((q, i) => (
                <div key={i} className="rounded-lg border border-border bg-background overflow-hidden">
                  <button
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
                    onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{q.question}</p>
                      <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${QUESTION_TYPE_BADGE[q.type] ?? QUESTION_TYPE_BADGE.technical}`}>
                        {q.type?.replace("_", " ")}
                      </span>
                    </div>
                    {expandedQ === i
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    }
                  </button>
                  {expandedQ === i && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                      <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-3 space-y-1">
                        <p className="text-xs font-semibold text-violet-400">Model Answer</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{q.model_answer}</p>
                      </div>
                      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3 space-y-1">
                        <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
                          <Lightbulb className="h-3.5 w-3.5" /> Interview Tip
                        </p>
                        <p className="text-sm text-muted-foreground">{q.tips}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Salary Intelligence */}
          {(report.salary.min > 0 || report.salary.max > 0) && (
            <Section title="Salary Intelligence" icon={DollarSign} defaultOpen={false}>
              <div className="flex items-center gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Min</span><span>Max</span>
                  </div>
                  <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
                    <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-blue-500/60 via-violet-500/80 to-violet-600" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-blue-400">{formatSalary(report.salary.min, report.salary.currency)}</span>
                    <span className="text-xs text-muted-foreground">–</span>
                    <span className="text-lg font-bold text-violet-400">{formatSalary(report.salary.max, report.salary.currency)}</span>
                  </div>
                </div>
              </div>

              {report.salary.factors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Salary Factors</p>
                  <ul className="space-y-1">
                    {report.salary.factors.map((f) => (
                      <li key={f} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-violet-400 mt-0.5 shrink-0">•</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.salary.negotiationTip && (
                <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-green-400 flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" /> Negotiation Strategy
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{report.salary.negotiationTip}</p>
                </div>
              )}
            </Section>
          )}

          {/* Application Strategy */}
          <Section title="Application Strategy" icon={Compass} defaultOpen={false}>
            {report.strategy.overview && (
              <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-3">
                <p className="text-sm text-muted-foreground leading-relaxed">{report.strategy.overview}</p>
              </div>
            )}

            {report.strategy.timing && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <p>{report.strategy.timing}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* DOs */}
              {report.strategy.dos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-green-400 flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5" /> Do This
                  </p>
                  <ul className="space-y-1.5">
                    {report.strategy.dos.map((d) => (
                      <li key={d} className="text-sm text-muted-foreground flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />{d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* DON'Ts */}
              {report.strategy.donts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                    <ThumbsDown className="h-3.5 w-3.5" /> Avoid This
                  </p>
                  <ul className="space-y-1.5">
                    {report.strategy.donts.map((d) => (
                      <li key={d} className="text-sm text-muted-foreground flex items-start gap-2">
                        <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />{d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Referral Tips */}
            {report.strategy.referralTips.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Referral Strategy
                </p>
                <ul className="space-y-1">
                  {report.strategy.referralTips.map((t) => (
                    <li key={t} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-yellow-400 mt-0.5 shrink-0">→</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* LinkedIn Tips */}
            {report.strategy.linkedinTips.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" /> LinkedIn Optimization
                </p>
                <ul className="space-y-1">
                  {report.strategy.linkedinTips.map((t) => (
                    <li key={t} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5 shrink-0">→</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {/* Run again */}
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => { setReport(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="gap-2 text-sm">
              <Target className="h-4 w-4" /> Analyze Another Job
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
