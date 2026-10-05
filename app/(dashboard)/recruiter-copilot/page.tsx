"use client";
import { useEffect, useRef, useState } from "react";
import {
  Send, Loader2, Bot, User, Workflow, ShieldAlert, FileText, CalendarClock,
  Plus, Trash2, ChevronDown, ChevronUp, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalCard, type Approval, type ApprovalAnswer } from "./approval-card";
import { runAgentJob } from "@/lib/agentJobClient";

// ── Types ────────────────────────────────────────────────────────
interface Slot { startsAt: string; durationMin?: number }

interface Meta {
  intents?: string[];
  needsReview?: boolean;
  reviewReasons?: string[];
  sources?: string[];
  slots?: Slot[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: Meta;
}

interface ContextForm {
  resumeId: string;
  jobDescription: string;
  candidateName: string;
  candidateEmail: string;
}

interface Remembered {
  has_resume: boolean;
  has_job_description: boolean;
  candidate_name: string | null;
}

const EMPTY_CONTEXT: ContextForm = { resumeId: "", jobDescription: "", candidateName: "", candidateEmail: "" };
const THREAD_KEY = "recruiterCopilot.threadId";

const INTENT_LABEL: Record<string, string> = {
  resume_screening: "Resume screening",
  scheduling: "Scheduling",
  faq: "Policy FAQ",
  other: "General",
};

const SUGGESTIONS = [
  "Screen this candidate and, if shortlisted, propose interview slots",
  "Screen this candidate against the job description",
  "Propose interview slots for her next week",
  "What is our leave policy?",
  "What did we decide about this candidate so far?",
];

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your Recruitment Copilot. I can screen a resume against a job, propose interview slots, and answer company-policy questions.\n\nAdd a resume and job description under *Context* once — I'll remember them for the rest of this conversation.",
};

// Per-viewer convenience only: which thread to reopen. Must never break the page.
function readThreadId(): string | null {
  try { return localStorage.getItem(THREAD_KEY); } catch { return null; }
}
function writeThreadId(id: string | null) {
  try {
    if (id) localStorage.setItem(THREAD_KEY, id);
    else localStorage.removeItem(THREAD_KEY);
  } catch { /* storage unavailable */ }
}

interface CopilotResponse {
  thread_id?: string;
  status?: "completed" | "awaiting_approval";
  approval?: Approval;
  booking?: { booked: boolean; emailSent: boolean; scheduledAt?: string; error?: string };
  reply?: string;
  intent?: string;
  needs_human_review?: boolean;
  review_reasons?: string[];
  result?: StepResult;
  // Multi-step turns (planner + supervisor): every executed step, in order.
  steps?: { intent: string; result: StepResult }[];
  error?: string;
}

interface StepResult { sources?: string[]; proposed_slots?: Slot[] }

function metaFrom(data: CopilotResponse): Meta {
  const steps = data.steps?.length ? data.steps : data.intent ? [{ intent: data.intent, result: data.result ?? {} }] : [];
  return {
    intents: steps.map((s) => s.intent),
    needsReview: data.needs_human_review,
    reviewReasons: data.review_reasons,
    sources: steps.flatMap((s) => s.result?.sources ?? []),
    slots: steps.flatMap((s) => s.result?.proposed_slots ?? []),
  };
}

export default function RecruiterCopilotPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // A paused run waiting on the recruiter (human-in-the-loop gate).
  const [pending, setPending] = useState<Approval | null>(null);
  const [answering, setAnswering] = useState(false);
  // Live step of the running turn ("Checking GitHub", "Finding interview slots", …)
  const [step, setStep] = useState<string | null>(null);

  const [showContext, setShowContext] = useState(true);
  const [context, setContext] = useState<ContextForm>(EMPTY_CONTEXT);
  const [remembered, setRemembered] = useState<Remembered | null>(null);
  const [resumes, setResumes] = useState<{ id: string; fileName: string }[]>([]);
  // Context already sent on this thread — only changed fields are sent again.
  const sentContext = useRef<ContextForm>(EMPTY_CONTEXT);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/resume/list").then((r) => r.json()).then((d) => setResumes(d.resumes ?? [])).catch(() => {});

    const saved = readThreadId();
    if (!saved) return;
    fetch(`/api/recruiter-copilot/${saved}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.exists) { writeThreadId(null); return; }
        setThreadId(saved);
        setRemembered(d.context);
        setPending(d.pending_approval ?? null);
        setShowContext(false);
        setMessages([
          WELCOME,
          ...d.messages.map((m: { role: "user" | "assistant"; content: string }, i: number) => ({
            id: `h-${i}`, role: m.role, content: m.content,
          })),
        ]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, pending]);

  function changedContext() {
    const out: Partial<ContextForm> = {};
    (Object.keys(context) as (keyof ContextForm)[]).forEach((k) => {
      const value = context[k].trim();
      if (value && value !== sentContext.current[k]) out[k] = value;
    });
    return out;
  }

  async function sendMessage(text: string) {
    if (text.trim().length < 3 || loading || pending) return;
    setError("");
    setMessages((p) => [...p, { id: `u-${Date.now()}`, role: "user", content: text.trim() }]);
    setInput("");
    setLoading(true);

    const ctx = changedContext();
    try {
      // The turn runs as a background job; poll it for live progress and the reply.
      const job = await runAgentJob<CopilotResponse>(
        () => fetch("/api/recruiter-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim(), threadId: threadId ?? undefined, ...ctx }),
        }),
        (label) => setStep(label),
      );
      if (job.status === "failed" || !job.result) throw new Error(job.error ?? "Copilot failed");
      const data = job.result;

      sentContext.current = { ...sentContext.current, ...ctx };
      if (data.thread_id && data.thread_id !== threadId) {
        setThreadId(data.thread_id);
        writeThreadId(data.thread_id);
      }
      setRemembered((r) => ({
        has_resume: Boolean(r?.has_resume || ctx.resumeId),
        has_job_description: Boolean(r?.has_job_description || ctx.jobDescription),
        candidate_name: ctx.candidateName ?? r?.candidate_name ?? null,
      }));
      setPending(data.status === "awaiting_approval" ? data.approval ?? null : null);
      setMessages((p) => [...p, {
        id: `a-${Date.now()}`, role: "assistant", content: data.reply || "(no reply)", meta: metaFrom(data),
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copilot failed");
    } finally {
      setLoading(false);
      setStep(null);
    }
  }

  async function answerApproval(answer: ApprovalAnswer) {
    if (!threadId) return;
    setAnswering(true);
    setError("");
    try {
      const res = await fetch(`/api/recruiter-copilot/${threadId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answer),
      });
      const data: CopilotResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit your decision");

      setPending(data.status === "awaiting_approval" ? data.approval ?? null : null);
      const booking = data.booking;
      const bookingLine = !booking ? ""
        : booking.error ? `\n\n⚠️ ${booking.error}`
        : `\n\n✅ Booked for ${booking.scheduledAt}${booking.emailSent ? " — confirmation email sent." : "."}`;
      setMessages((p) => [...p, {
        id: `a-${Date.now()}`, role: "assistant", content: (data.reply || "(no reply)") + bookingLine, meta: metaFrom(data),
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your decision");
    } finally {
      setAnswering(false);
    }
  }

  function newConversation() {
    setPending(null);
    setThreadId(null);
    writeThreadId(null);
    setMessages([WELCOME]);
    setContext(EMPTY_CONTEXT);
    setRemembered(null);
    sentContext.current = EMPTY_CONTEXT;
    setShowContext(true);
    setError("");
  }

  async function deleteConversation() {
    if (!threadId || !confirm("Delete this conversation permanently?")) return;
    await fetch(`/api/recruiter-copilot/${threadId}`, { method: "DELETE" }).catch(() => {});
    newConversation();
  }

  function renderInline(text: string) {
    return text.split(/(\*[^*]+\*)/g).map((part, i) =>
      part.startsWith("*") && part.endsWith("*")
        ? <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>
        : part,
    );
  }

  function renderContent(content: string) {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return <li key={i} className="ml-4 list-disc text-sm">{renderInline(line.slice(2))}</li>;
      }
      if (!line.trim()) return <br key={i} />;
      return <p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>;
    });
  }

  function renderMeta(meta: Meta) {
    return (
      <div className="mt-3 space-y-2">
        {meta.intents && meta.intents.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {meta.intents.map((intent, i) => (
              <span key={intent} className="flex items-center gap-1">
                {i > 0 && <span className="text-xs text-muted-foreground">→</span>}
                <Badge variant="secondary" className="text-[11px]">{INTENT_LABEL[intent] ?? intent}</Badge>
              </span>
            ))}
          </div>
        )}
        {meta.needsReview && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-500">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldAlert className="h-3.5 w-3.5" /> Needs human review
            </div>
            {meta.reviewReasons?.map((r) => <p key={r} className="mt-1">{r}</p>)}
          </div>
        )}
        {meta.sources && meta.sources.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Sources: {meta.sources.join(", ")}
          </p>
        )}
        {meta.slots && meta.slots.length > 0 && (
          <div className="space-y-1">
            {meta.slots.map((s) => (
              <p key={s.startsAt} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                {new Date(s.startsAt).toLocaleString()} {s.durationMin ? `· ${s.durationMin} min` : ""}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  const fieldClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>
      {/* Header */}
      <div className="shrink-0 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Workflow className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Recruitment Copilot</h1>
            <p className="text-xs text-muted-foreground">Multi-agent: screening · scheduling · policy FAQ — with conversation memory</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={newConversation} disabled={loading}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
          {threadId && (
            <Button variant="outline" size="sm" onClick={deleteConversation} disabled={loading}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Context */}
      <Card className="shrink-0 mb-3 px-4 py-3">
        <button
          className="flex w-full items-center justify-between text-sm font-medium"
          onClick={() => setShowContext((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-400" /> Context
            {remembered && (remembered.has_resume || remembered.has_job_description || remembered.candidate_name) && (
              <span className="text-xs font-normal text-muted-foreground">
                remembered: {[
                  remembered.has_resume && "resume",
                  remembered.has_job_description && "job description",
                  remembered.candidate_name,
                ].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          {showContext ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showContext && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              className={fieldClass}
              value={context.resumeId}
              onChange={(e) => setContext({ ...context, resumeId: e.target.value })}
            >
              <option value="">— Candidate resume —</option>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}
            </select>
            <Input
              placeholder="Candidate name"
              value={context.candidateName}
              onChange={(e) => setContext({ ...context, candidateName: e.target.value })}
            />
            <Input
              placeholder="Candidate email (optional)"
              value={context.candidateEmail}
              onChange={(e) => setContext({ ...context, candidateEmail: e.target.value })}
            />
            <Textarea
              placeholder="Paste the job description"
              value={context.jobDescription}
              onChange={(e) => setContext({ ...context, jobDescription: e.target.value })}
              className="min-h-[72px] sm:col-span-2"
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Sent with your next message, then remembered by this conversation.
            </p>
          </div>
        )}
      </Card>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              msg.role === "assistant" ? "bg-violet-600" : "bg-secondary"
            }`}>
              {msg.role === "assistant" ? <Bot className="h-4 w-4 text-white" /> : <User className="h-4 w-4" />}
            </div>
            <Card className={`max-w-[85%] px-4 py-3 ${
              msg.role === "user"
                ? "bg-violet-600 border-violet-600 text-white rounded-tr-sm"
                : "bg-card border-border rounded-tl-sm"
            }`}>
              <div className={msg.role === "user" ? "text-white" : "text-foreground"}>
                {renderContent(msg.content)}
              </div>
              {msg.meta && renderMeta(msg.meta)}
            </Card>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-5 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              <p className="text-xs text-muted-foreground mt-2">{step ? `${step}…` : "Routing to the right agent..."}</p>
            </div>
          </div>
        )}
        {pending && <ApprovalCard key={JSON.stringify(pending)} approval={pending} busy={answering} onAnswer={answerApproval} />}
        <div ref={bottomRef} />
      </div>

      {error && <p className="shrink-0 text-sm text-red-500 py-2">{error}</p>}

      {messages.length <= 1 && (
        <div className="shrink-0 py-3">
          <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => sendMessage(s)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder={pending ? "Answer the approval above to continue" : "Ask the copilot — e.g. “screen this candidate”, “book her for Tuesday”"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            className="min-h-[52px] max-h-[120px] resize-none"
            disabled={loading || Boolean(pending)}
          />
          <Button onClick={() => sendMessage(input)} disabled={input.trim().length < 3 || loading || Boolean(pending)}
            size="icon" className="h-[52px] w-12 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
