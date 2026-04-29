"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Bot, Plus, FileText, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Copy, Check, Trash2, ExternalLink, Sparkles, ClipboardList, MessageSquare,
  AlertCircle, Zap, TrendingUp, Clock, Target, BookOpen, Link2, Mail,
  Wand2, RefreshCw, Send, Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────
interface Resume { id: string; fileName: string; }
interface GapAnalysis {
  matchScore: number; matchedSkills: string[]; missingSkills: string[];
  experienceGaps: string[]; strengths: string[]; quickWins: string[];
  overallVerdict: string; hiringChance: "high" | "medium" | "low";
}
interface CoverLetterResult {
  subject: string; coverLetter: string;
  keyPointsUsed: string[]; customizationTips: string[];
}
interface InterviewQuestion { question: string; why: string; tipToAnswer: string; }
interface InterviewQuestionsResult {
  technical: InterviewQuestion[]; behavioral: InterviewQuestion[];
  roleSpecific: InterviewQuestion[]; questionsToAsk: string[];
}
interface ChecklistStep {
  step: number; category: string; action: string;
  priority: "high" | "medium" | "low"; timeEstimate: string; done: boolean;
}
interface ApplicationChecklist {
  checklist: ChecklistStep[]; totalEstimatedTime: string;
  priorityActions: string[]; redFlags: string[]; applicationStrategy: string;
}
interface TailoredBullet {
  section: string; company: string; original: string; improved: string; reason: string;
}
interface ResumeTailorResult {
  tailoredBullets: TailoredBullet[]; keywordsAdded: string[];
  summaryRewrite: string; titleSuggestion: string;
}
interface FollowUpEmailResult {
  subject: string; emailBody: string; tone: string;
  sendTiming: string; followUpTip: string;
}
interface JobApplication {
  id: string; jobTitle: string; company?: string; jobUrl?: string;
  status: "draft" | "applied" | "interview" | "offer" | "rejected";
  createdAt: string; resumeId?: string;
  resumeGapAnalysis?: GapAnalysis; coverLetter?: string;
  interviewQuestions?: InterviewQuestionsResult;
  applicationChecklist?: ApplicationChecklist;
  tailoredResumeBullets?: ResumeTailorResult;
  followUpEmailDraft?: string;
}

// ── Constants ────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft:     { label: "Draft",     cls: "bg-secondary text-muted-foreground border-border" },
  applied:   { label: "Applied",   cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  interview: { label: "Interview", cls: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  offer:     { label: "Offer 🎉",  cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  rejected:  { label: "Rejected",  cls: "bg-red-500/20 text-red-400 border-red-500/30" },
};
const PRIORITY_CLS = {
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-green-400 bg-green-500/10 border-green-500/20",
};
const CAT_ICON: Record<string, string> = {
  resume: "📄", cover_letter: "✉️", research: "🔍",
  networking: "🤝", preparation: "🎯", application: "📤",
};

// ── Shared helpers ───────────────────────────────────────────────
function ScoreArc({ score, chance }: { score: number; chance: string }) {
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  const chanceColor = chance === "high" ? "text-green-400" : chance === "medium" ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center w-20 h-20">
        <svg className="absolute" width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" className="text-border" />
          <circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${(score / 100) * 2 * Math.PI * 34} ${2 * Math.PI * 34}`}
            strokeLinecap="round" transform="rotate(-90 40 40)" />
        </svg>
        <span className="text-lg font-black" style={{ color }}>{score}</span>
      </div>
      <span className={`text-xs font-semibold capitalize ${chanceColor}`}>{chance} chance</span>
    </div>
  );
}
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors">
      {copied ? <><Check className="h-3 w-3 text-green-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
    </button>
  );
}

// ── Tab: Gap Analysis ────────────────────────────────────────────
function GapTab({ gap }: { gap: GapAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 p-4 rounded-xl border border-border bg-card">
        <ScoreArc score={gap.matchScore} chance={gap.hiringChance} />
        <p className="text-sm text-muted-foreground leading-relaxed flex-1">{gap.overallVerdict}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Matched ({gap.matchedSkills.length})</p>
          <div className="flex flex-wrap gap-1.5">{gap.matchedSkills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{s}</span>)}</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-red-400 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Missing ({gap.missingSkills.length})</p>
          <div className="flex flex-wrap gap-1.5">{gap.missingSkills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>)}</div>
        </div>
      </div>
      {gap.quickWins.length > 0 && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1"><Zap className="h-3.5 w-3.5" />Quick Wins Before Applying</p>
          <ul className="space-y-1">{gap.quickWins.map((w) => <li key={w} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-yellow-400 mt-0.5">→</span>{w}</li>)}</ul>
        </div>
      )}
      {gap.strengths.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-violet-400 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Your Strengths</p>
          <ul className="space-y-1">{gap.strengths.map((s) => <li key={s} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span>{s}</li>)}</ul>
        </div>
      )}
      {gap.experienceGaps.length > 0 && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-orange-400 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Experience Gaps</p>
          <ul className="space-y-1">{gap.experienceGaps.map((g) => <li key={g} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-orange-400 mt-0.5">!</span>{g}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ── Tab: Cover Letter ────────────────────────────────────────────
function CoverLetterTab({ data, rawText }: { data: CoverLetterResult; rawText: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Subject: <span className="text-foreground">{data.subject}</span></p>
        <CopyButton text={rawText} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{rawText}</pre>
      </div>
      {data.keyPointsUsed.length > 0 && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-violet-400">Key Points Highlighted</p>
          <ul className="space-y-1">{data.keyPointsUsed.map((p) => <li key={p} className="text-xs text-muted-foreground flex items-start gap-2"><CheckCircle2 className="h-3 w-3 text-violet-400 mt-0.5 shrink-0" />{p}</li>)}</ul>
        </div>
      )}
      {data.customizationTips.length > 0 && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-blue-400 flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />Customization Tips</p>
          <ul className="space-y-1">{data.customizationTips.map((t) => <li key={t} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-blue-400 mt-0.5">→</span>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ── Tab: Interview Questions ─────────────────────────────────────
function QuestionsTab({ data }: { data: InterviewQuestionsResult }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  function Section({ title, items, color }: { title: string; items: InterviewQuestion[]; color: string }) {
    return (
      <div className="space-y-2">
        <p className={`text-xs font-semibold ${color}`}>{title} ({items.length})</p>
        {items.map((q, i) => {
          const key = `${title}-${i}`; const open = expanded === key;
          return (
            <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
              <button className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors" onClick={() => setExpanded(open ? null : key)}>
                <span className="text-xs font-bold text-muted-foreground mt-0.5 shrink-0 w-5">{i + 1}.</span>
                <p className="text-sm flex-1">{q.question}</p>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
              </button>
              {open && (
                <div className="border-t border-border px-4 pb-3 pt-2 space-y-2">
                  <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-2">
                    <p className="text-[10px] font-semibold text-yellow-400 mb-1">Why they ask this</p>
                    <p className="text-xs text-muted-foreground">{q.why}</p>
                  </div>
                  <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2">
                    <p className="text-[10px] font-semibold text-green-400 mb-1">How to answer</p>
                    <p className="text-xs text-muted-foreground">{q.tipToAnswer}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {data.technical.length > 0 && <Section title="Technical Questions" items={data.technical} color="text-blue-400" />}
      {data.behavioral.length > 0 && <Section title="Behavioral Questions" items={data.behavioral} color="text-violet-400" />}
      {data.roleSpecific.length > 0 && <Section title="Role-Specific Questions" items={data.roleSpecific} color="text-orange-400" />}
      {data.questionsToAsk.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-green-400">Questions YOU Should Ask</p>
          {data.questionsToAsk.map((q) => (
            <div key={q} className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-start gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">{q}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Checklist ───────────────────────────────────────────────
function ChecklistTab({ data, onUpdate }: { data: ApplicationChecklist; onUpdate: (c: ApplicationChecklist) => void }) {
  const [steps, setSteps] = useState(data.checklist);
  function toggle(idx: number) {
    const updated = steps.map((s, i) => i === idx ? { ...s, done: !s.done } : s);
    setSteps(updated); onUpdate({ ...data, checklist: updated });
  }
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{done}/{steps.length} steps complete</span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Est. {data.totalEstimatedTime}</span>
          {pct === 100 && <span className="text-green-400 font-semibold">Ready to apply! 🚀</span>}
        </div>
      </div>
      {data.applicationStrategy && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <p className="text-xs font-semibold text-violet-400 mb-1 flex items-center gap-1"><Target className="h-3.5 w-3.5" />Application Strategy</p>
          <p className="text-sm text-muted-foreground">{data.applicationStrategy}</p>
        </div>
      )}
      {data.redFlags.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-1">
          <p className="text-xs font-semibold text-red-400 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Potential Red Flags</p>
          {data.redFlags.map((f) => <p key={f} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-red-400 mt-0.5">!</span>{f}</p>)}
        </div>
      )}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className={`rounded-xl border p-3 flex items-start gap-3 cursor-pointer transition-all ${step.done ? "border-green-500/20 bg-green-500/5 opacity-70" : "border-border bg-card hover:border-violet-500/40"}`} onClick={() => toggle(i)}>
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 mt-0.5 transition-all ${step.done ? "bg-green-500 border-green-500" : "border-border"}`}>
              {step.done && <Check className="h-3 w-3 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm">{CAT_ICON[step.category] ?? "📌"}</span>
                <p className={`text-sm ${step.done ? "line-through text-muted-foreground" : ""}`}>{step.action}</p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${PRIORITY_CLS[step.priority]}`}>{step.priority}</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{step.timeEstimate}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Resume Tailor (NEW) ─────────────────────────────────────
function TailorTab({ appId, resumeId, existing, onDone }: {
  appId: string; resumeId?: string;
  existing?: ResumeTailorResult; onDone: (r: ResumeTailorResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ResumeTailorResult | null>(existing ?? null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  async function run() {
    setLoading(true); setError("");
    const res = await fetch(`/api/job-agent/${appId}/tailor`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeId }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setError(d.error ?? "Failed"); return; }
    setData(d.tailor); onDone(d.tailor);
  }

  if (!data) return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5 text-center space-y-3">
        <Wand2 className="h-8 w-8 text-violet-400 mx-auto" />
        <p className="text-sm font-medium">AI Resume Tailor</p>
        <p className="text-xs text-muted-foreground">AI rewrites your resume bullet points to match this specific JD — adds keywords, quantifies achievements, improves ATS score.</p>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={run} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {loading ? "Tailoring resume..." : "Tailor My Resume"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          {data.titleSuggestion && <p className="text-xs text-muted-foreground">Suggested title: <span className="text-violet-400 font-medium">{data.titleSuggestion}</span></p>}
          {data.keywordsAdded.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">Keywords added:</span>
              {data.keywordsAdded.map((k) => <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">{k}</span>)}
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={run} disabled={loading} className="gap-1 text-xs">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Re-tailor
        </Button>
      </div>

      {data.summaryRewrite && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-400">Rewritten Summary</p>
            <CopyButton text={data.summaryRewrite} />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summaryRewrite}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Improved Bullet Points ({data.tailoredBullets.length})</p>
        {data.tailoredBullets.map((b, i) => (
          <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
            <button className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors" onClick={() => setExpanded(expanded === i ? null : i)}>
              <span className="text-xs text-muted-foreground mt-0.5 shrink-0">{b.section}</span>
              <p className="text-xs flex-1 text-muted-foreground truncate">{b.original}</p>
              {expanded === i ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
            {expanded === i && (
              <div className="border-t border-border p-3 space-y-2">
                <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
                  <p className="text-[10px] font-semibold text-red-400 mb-1">Original</p>
                  <p className="text-xs text-muted-foreground">{b.original}</p>
                </div>
                <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-green-400">Improved</p>
                    <CopyButton text={b.improved} />
                  </div>
                  <p className="text-xs text-muted-foreground">{b.improved}</p>
                </div>
                <p className="text-[10px] text-muted-foreground italic">{b.reason}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Follow-up Emails + Send to HR (NEW) ────────────────────
function FollowUpTab({ appId, userName, existing, onDone }: {
  appId: string; userName: string;
  existing?: string; onDone: (email: string) => void;
}) {
  const [stage, setStage] = useState<"after_apply" | "after_interview" | "no_response">("after_apply");
  const [days, setDays] = useState(7);
  const [name, setName] = useState(userName);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FollowUpEmailResult | null>(null);
  const [error, setError] = useState("");

  // Send to HR state
  const [hrEmail, setHrEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState("");
  const [sendError, setSendError] = useState("");

  // Template selector
  const [template, setTemplate] = useState<"cold_outreach" | "application_confirm" | "followup">("followup");

  const STAGE_LABELS = {
    after_apply:    { label: "After Applying",   desc: "No response after applying",          icon: "📤" },
    after_interview:{ label: "After Interview",  desc: "Waiting for feedback post-interview",  icon: "🎤" },
    no_response:    { label: "No Response",      desc: "Final follow-up before moving on",     icon: "🔔" },
  };

  const TEMPLATE_LABELS = {
    cold_outreach:       { label: "Cold Outreach",         desc: "Before applying — reach HR directly", icon: "🎯" },
    application_confirm: { label: "Application Sent",      desc: "Confirm your application was sent",   icon: "✅" },
    followup:            { label: "Follow-up",             desc: "Check status after applying",         icon: "📬" },
  };

  async function generate() {
    setLoading(true); setError(""); setSendSuccess(""); setSendError("");
    const res = await fetch(`/api/job-agent/${appId}/followup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, candidateName: name || "Candidate", daysSinceApplied: days }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setError(d.error ?? "Failed"); return; }
    setResult(d.followUp);
    setEditSubject(d.followUp.subject);
    setEditBody(d.followUp.emailBody);
    setIsEditing(false);
    onDone(d.followUp.emailBody);
  }

  async function sendToHR() {
    if (!hrEmail.trim()) { setSendError("Enter HR email address"); return; }
    setSending(true); setSendError(""); setSendSuccess("");
    const res = await fetch(`/api/job-agent/${appId}/send-hr`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hrEmail,
        subject: editSubject,
        emailBody: editBody,
        senderName: name || "Candidate",
        replyTo: replyTo || undefined,
      }),
    });
    const d = await res.json();
    setSending(false);
    if (!res.ok) { setSendError(d.error ?? "Failed to send"); return; }
    setSendSuccess(`✅ Email sent to ${d.sentTo}`);
  }

  return (
    <div className="space-y-5">

      {/* Template type */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email Type</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(TEMPLATE_LABELS) as [typeof template, typeof TEMPLATE_LABELS[typeof template]][]).map(([key, val]) => (
            <button key={key} onClick={() => setTemplate(key)}
              className={`rounded-xl border p-3 text-left transition-all ${template === key ? "border-violet-500 bg-violet-500/10" : "border-border bg-card hover:border-violet-500/40"}`}>
              <div className="text-lg mb-1">{val.icon}</div>
              <p className="text-xs font-semibold leading-tight">{val.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{val.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Situation + days (only for followup) */}
      {template === "followup" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(STAGE_LABELS) as [typeof stage, typeof STAGE_LABELS[typeof stage]][]).map(([key, val]) => (
              <button key={key} onClick={() => setStage(key)}
                className={`rounded-xl border p-3 text-left transition-all ${stage === key ? "border-blue-500 bg-blue-500/10" : "border-border bg-card hover:border-blue-500/40"}`}>
                <div className="text-base mb-1">{val.icon}</div>
                <p className="text-xs font-semibold leading-tight">{val.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{val.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Days since applied</label>
            <span className="text-sm font-bold text-violet-400">{days} days</span>
          </div>
          <input type="range" min={1} max={30} value={days}
            onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-violet-500" />
        </div>
      )}

      {/* Your name */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Your Name</label>
        <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
      </div>

      {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}

      <Button onClick={generate} disabled={loading} className="w-full gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {loading ? "Generating..." : "Generate Email Draft"}
      </Button>

      {/* Generated email */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Subject */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input className="w-full bg-transparent text-sm font-medium focus:outline-none"
                    value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                ) : (
                  <p className="text-sm font-medium truncate">{editSubject}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">Subject line</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button onClick={() => setIsEditing(!isEditing)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <CopyButton text={`Subject: ${editSubject}\n\n${editBody}`} />
              </div>
            </div>

            {/* Body */}
            <div className="p-4">
              {isEditing ? (
                <textarea rows={8} className="w-full bg-transparent text-sm text-muted-foreground leading-relaxed focus:outline-none resize-none"
                  value={editBody} onChange={(e) => setEditBody(e.target.value)} />
              ) : (
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{editBody}</pre>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
              <p className="text-[10px] font-semibold text-blue-400 mb-1">Best time to send</p>
              <p className="text-xs text-muted-foreground">{result.sendTiming}</p>
            </div>
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
              <p className="text-[10px] font-semibold text-violet-400 mb-1">Pro tip</p>
              <p className="text-xs text-muted-foreground">{result.followUpTip}</p>
            </div>
          </div>

          {/* ── Send to HR ─────────────────────────────────────── */}
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
            <p className="text-xs font-semibold text-green-400 flex items-center gap-1">
              <Send className="h-3.5 w-3.5" /> Send Directly to HR
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">HR Email *</label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="hr@company.com"
                  value={hrEmail}
                  onChange={(e) => setHrEmail(e.target.value)}
                  type="email"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Your Email (Reply-To)</label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="your@email.com"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  type="email"
                />
              </div>
            </div>

            {sendError && (
              <p className="text-red-400 text-xs flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />{sendError}
              </p>
            )}
            {sendSuccess && (
              <p className="text-green-400 text-xs flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />{sendSuccess}
              </p>
            )}

            <Button onClick={sendToHR} disabled={sending || !hrEmail.trim()}
              className="w-full gap-2 bg-green-600 hover:bg-green-700">
              {sending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                : <><Send className="h-4 w-4" /> Send Email to HR</>}
            </Button>

            <p className="text-[10px] text-muted-foreground text-center">
              Email will be sent from your configured SMTP account. HR can reply directly to your email.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function JobAgentPage() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JobApplication | null>(null);
  const [activeTab, setActiveTab] = useState<"gap" | "cover" | "questions" | "checklist" | "tailor" | "followup">("gap");

  // New application form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ jobTitle: "", company: "", jobUrl: "", jobDescription: "" });
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [tone, setTone] = useState<"professional" | "enthusiastic" | "concise">("professional");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // URL scraper state
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState("");
  const [genError, setGenError] = useState("");

  // User name for follow-up emails
  const [userName, setUserName] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, resumesRes] = await Promise.all([
        fetch("/api/job-agent"),
        fetch("/api/resume/list"),
      ]);
      const appsData = await appsRes.json();
      const resumesData = await resumesRes.json();
      setApplications(appsData.applications ?? []);
      setResumes(resumesData.resumes ?? []);
    } catch (err) {
      console.error("[JOB_AGENT_FETCH]", err);
      setApplications([]);
      setResumes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Scrape JD from URL ─────────────────────────────────────────
  async function scrapeJD() {
    if (!scrapeUrl.trim()) return;
    setScraping(true); setScrapeError("");
    const res = await fetch("/api/job-agent/scrape-jd", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: scrapeUrl }),
    });
    const data = await res.json();
    setScraping(false);
    if (!res.ok) { setScrapeError(data.error ?? "Could not extract JD"); return; }
    const jd = data.jd;
    setForm((prev) => ({
      ...prev,
      jobTitle: jd.jobTitle || prev.jobTitle,
      company: jd.company || prev.company,
      jobUrl: scrapeUrl,
      jobDescription: jd.jobDescription || prev.jobDescription,
    }));
    setScrapeUrl("");
  }

  // ── Create application ─────────────────────────────────────────
  async function createApplication() {
    setFormError("");
    if (!form.jobTitle.trim() || !form.jobDescription.trim()) {
      setFormError("Job title and description are required."); return;
    }
    if (!selectedResumeId) { setFormError("Please select a resume."); return; }
    setCreating(true);

    const res = await fetch("/api/job-agent", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, resumeId: selectedResumeId }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setFormError(data.error ?? "Failed to create"); return; }

    const app = data.application as JobApplication;
    const appWithResume = { ...app, resumeId: selectedResumeId };
    setApplications((prev) => [appWithResume, ...prev]);
    setSelected(appWithResume);
    setShowForm(false);
    setForm({ jobTitle: "", company: "", jobUrl: "", jobDescription: "" });
    runGeneration(appWithResume);
  }

  // ── Run AI pipeline ────────────────────────────────────────────
  async function runGeneration(app: JobApplication) {
    setGenerating(true); setGenError("");
    const steps = [
      { key: "gap",       label: "Analyzing resume vs JD..." },
      { key: "cover",     label: "Writing cover letter..." },
      { key: "questions", label: "Generating interview questions..." },
      { key: "checklist", label: "Building application checklist..." },
    ] as const;

    for (const step of steps) {
      setGenStep(step.label);
      const res = await fetch(`/api/job-agent/${app.id}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: app.resumeId, tone, steps: [step.key] }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error ?? "Generation failed"); break; }

      setSelected((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          resumeGapAnalysis:    data.gap        ?? prev.resumeGapAnalysis,
          coverLetter:          data.coverLetter?.coverLetter ?? prev.coverLetter,
          interviewQuestions:   data.questions  ?? prev.interviewQuestions,
          applicationChecklist: data.checklist  ?? prev.applicationChecklist,
          _coverLetterFull:     data.coverLetter ?? (prev as JobApplication & { _coverLetterFull?: CoverLetterResult })._coverLetterFull,
        } as JobApplication & { _coverLetterFull?: CoverLetterResult };
      });
      setApplications((prev) => prev.map((a) => a.id === app.id ? {
        ...a,
        resumeGapAnalysis:    data.gap        ?? a.resumeGapAnalysis,
        coverLetter:          data.coverLetter?.coverLetter ?? a.coverLetter,
        interviewQuestions:   data.questions  ?? a.interviewQuestions,
        applicationChecklist: data.checklist  ?? a.applicationChecklist,
      } : a));
    }
    setGenerating(false); setGenStep("");
  }

  async function updateStatus(appId: string, status: JobApplication["status"]) {
    await fetch(`/api/job-agent/${appId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(status === "applied" ? { appliedAt: new Date().toISOString() } : {}) }),
    });
    setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status } : a));
    setSelected((prev) => prev?.id === appId ? { ...prev, status } : prev);
  }

  async function deleteApp(appId: string) {
    if (!confirm("Delete this application?")) return;
    await fetch(`/api/job-agent/${appId}`, { method: "DELETE" });
    setApplications((prev) => prev.filter((a) => a.id !== appId));
    if (selected?.id === appId) setSelected(null);
  }

  const TABS = [
    { key: "gap",       label: "Gap Analysis",   icon: TrendingUp },
    { key: "cover",     label: "Cover Letter",   icon: FileText },
    { key: "questions", label: "Interview Prep", icon: MessageSquare },
    { key: "checklist", label: "Checklist",      icon: ClipboardList },
    { key: "tailor",    label: "Tailor Resume",  icon: Wand2 },
    { key: "followup",  label: "Follow-up",      icon: Mail },
  ] as const;

  const selectedFull = selected as (JobApplication & { _coverLetterFull?: CoverLetterResult }) | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-violet-500" /> Job Application Agent
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Paste JD or URL → AI writes cover letter, tailors resume, preps interview, sends follow-ups.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" /> New Application
        </Button>
      </div>

      {/* New Application Form */}
      {showForm && (
        <div className="rounded-xl border border-violet-500/30 bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" /> New Job Application
          </h2>
          {formError && (
            <p className="text-red-400 text-sm flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />{formError}
            </p>
          )}

          {/* URL Scraper */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-400 flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" /> Auto-fill from Job URL
            </p>
            <p className="text-xs text-muted-foreground">Paste a LinkedIn, Naukri, or Indeed job URL — AI extracts the JD automatically.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://linkedin.com/jobs/view/..."
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && scrapeJD()}
              />
              <Button size="sm" onClick={scrapeJD} disabled={scraping || !scrapeUrl.trim()} className="gap-1 bg-blue-600 hover:bg-blue-700 shrink-0">
                {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {scraping ? "Extracting..." : "Extract"}
              </Button>
            </div>
            {scrapeError && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{scrapeError}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Job Title *</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. Senior React Developer"
                value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Company</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. Google"
                value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Job URL (optional)</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="https://..."
                value={form.jobUrl} onChange={(e) => setForm({ ...form, jobUrl: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Select Resume *</label>
              <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={selectedResumeId} onChange={(e) => setSelectedResumeId(e.target.value)}>
                <option value="">— Choose resume —</option>
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Job Description * (paste full JD or use URL extractor above)</label>
            <textarea rows={5} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              placeholder="Paste the complete job description here..."
              value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Cover Letter Tone</label>
            <div className="flex gap-2">
              {(["professional", "enthusiastic", "concise"] as const).map((t) => (
                <button key={t} onClick={() => setTone(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${tone === t ? "bg-violet-600 border-violet-600 text-white" : "border-border text-muted-foreground hover:border-violet-500/50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={createApplication} disabled={creating} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {creating ? "Creating..." : "Create & Run AI Agent"}
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setScrapeError(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Applications list */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Applications ({applications.length})
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : applications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
              No applications yet. Click &quot;New Application&quot; to start.
            </div>
          ) : (
            applications.map((app) => {
              const sc = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.draft;
              const hasData = !!(app.resumeGapAnalysis || app.coverLetter);
              const gap = app.resumeGapAnalysis as GapAnalysis | undefined;
              return (
                <div key={app.id}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${selected?.id === app.id ? "border-violet-500 bg-violet-500/5" : "border-border bg-card hover:border-violet-500/40"}`}
                  onClick={() => { setSelected(app); setActiveTab("gap"); }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{app.jobTitle}</p>
                        {hasData && <Sparkles className="h-3 w-3 text-violet-400 shrink-0" />}
                      </div>
                      {app.company && <p className="text-xs text-muted-foreground">{app.company}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                        {gap && (
                          <span className={`text-[10px] font-semibold ${gap.matchScore >= 70 ? "text-green-400" : gap.matchScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                            {gap.matchScore}% match
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteApp(app.id); }}
                      className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-dashed border-border p-16 text-center text-muted-foreground text-sm">
              Select an application to view AI-generated content.
            </div>
          ) : (
            <>
              {/* App header */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-bold text-lg">{selected.jobTitle}</h2>
                    {selected.company && <p className="text-muted-foreground text-sm">{selected.company}</p>}
                    {selected.jobUrl && (
                      <a href={selected.jobUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-violet-400 hover:underline flex items-center gap-1 mt-1">
                        <ExternalLink className="h-3 w-3" /> View Job Posting
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                      value={selected.status}
                      onChange={(e) => updateStatus(selected.id, e.target.value as JobApplication["status"])}
                    >
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => runGeneration(selected)} disabled={generating} className="gap-1 text-xs">
                      {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      {generating ? genStep || "Running..." : "Re-run Agent"}
                    </Button>
                  </div>
                </div>
                {generating && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-violet-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /><span>{genStep}</span>
                  </div>
                )}
                {genError && (
                  <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />{genError}
                  </p>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 rounded-lg bg-secondary p-1 overflow-x-auto">
                {TABS.map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${activeTab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {!selected.resumeGapAnalysis && !generating ? (
                <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
                  <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground text-sm">AI hasn&apos;t run yet for this application.</p>
                  <Button onClick={() => runGeneration(selected)} className="gap-2">
                    <Sparkles className="h-4 w-4" /> Run AI Agent
                  </Button>
                </div>
              ) : generating && !selected.resumeGapAnalysis ? (
                <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-3 text-muted-foreground text-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  <p>{genStep || "AI is working..."}</p>
                  <p className="text-xs">This takes about 30-60 seconds</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-5">
                  {activeTab === "gap" && selected.resumeGapAnalysis && (
                    <GapTab gap={selected.resumeGapAnalysis as GapAnalysis} />
                  )}
                  {activeTab === "cover" && selected.coverLetter && (
                    <CoverLetterTab
                      data={selectedFull?._coverLetterFull ?? {
                        subject: `Application for ${selected.jobTitle}`,
                        coverLetter: selected.coverLetter,
                        keyPointsUsed: [], customizationTips: [],
                      }}
                      rawText={selected.coverLetter}
                    />
                  )}
                  {activeTab === "questions" && selected.interviewQuestions && (
                    <QuestionsTab data={selected.interviewQuestions as InterviewQuestionsResult} />
                  )}
                  {activeTab === "checklist" && selected.applicationChecklist && (
                    <ChecklistTab
                      data={selected.applicationChecklist as ApplicationChecklist}
                      onUpdate={(updated) => setSelected((prev) => prev ? { ...prev, applicationChecklist: updated } : prev)}
                    />
                  )}
                  {activeTab === "tailor" && (
                    <TailorTab
                      appId={selected.id}
                      resumeId={selected.resumeId}
                      existing={selected.tailoredResumeBullets as ResumeTailorResult | undefined}
                      onDone={(r) => setSelected((prev) => prev ? { ...prev, tailoredResumeBullets: r } : prev)}
                    />
                  )}
                  {activeTab === "followup" && (
                    <FollowUpTab
                      appId={selected.id}
                      userName={userName}
                      existing={selected.followUpEmailDraft}
                      onDone={(email) => {
                        setSelected((prev) => prev ? { ...prev, followUpEmailDraft: email } : prev);
                      }}
                    />
                  )}
                  {/* Generating placeholder for tabs not yet ready */}
                  {generating && (
                    ((activeTab === "gap" && !selected.resumeGapAnalysis) ||
                    (activeTab === "cover" && !selected.coverLetter) ||
                    (activeTab === "questions" && !selected.interviewQuestions) ||
                    (activeTab === "checklist" && !selected.applicationChecklist))
                  ) && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Generating...
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
