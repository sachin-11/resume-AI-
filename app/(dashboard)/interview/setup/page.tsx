"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, BookOpen, Plus, X, Check, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PERSONAS, PERSONA_CATEGORIES, DEFAULT_PERSONA_ID } from "@/lib/personas";
import Link from "next/link";

interface Resume { id: string; fileName: string }
interface BankQuestion { id: string; text: string; category: string; difficulty: string; tags: string[] }

const CAT_COLOR: Record<string, string> = {
  technical:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  dsa:           "bg-violet-500/15 text-violet-400 border-violet-500/30",
  system_design: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  hr:            "bg-pink-500/15 text-pink-400 border-pink-500/30",
  behavioral:    "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export default function InterviewSetupPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [selectedCustomIds, setSelectedCustomIds] = useState<string[]>([]);
  const [showBank, setShowBank] = useState(false);
  const [loading, setLoading] = useState(false);
  const [limitError, setLimitError] = useState("");
  const [billing, setBilling] = useState<{ plan: string; remaining: number | null; used: number } | null>(null);
  const [form, setForm] = useState({
    resumeId: "", role: "", difficulty: "intermediate",
    roundType: "technical", questionCount: 5,
    persona: DEFAULT_PERSONA_ID,
  });

  useEffect(() => {
    fetch("/api/resume/list").then((r) => r.json()).then((d) => setResumes(d.resumes ?? []));
    fetch("/api/question-bank").then((r) => r.json()).then((d) => setBankQuestions(d.questions ?? []));
    fetch("/api/billing/status").then((r) => r.json()).then((d) => {
      setBilling({ plan: d.plan, remaining: d.remaining, used: d.interviewsThisMonth });
    });
  }, []);

  function toggleQuestion(id: string) {
    setSelectedCustomIds((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );
  }

  async function handleStart() {
    if (!form.role) return;
    setLoading(true);
    const res = await fetch("/api/interview/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        resumeId: form.resumeId === "none" || !form.resumeId ? undefined : form.resumeId,
        questionCount: Number(form.questionCount),
        customQuestionIds: selectedCustomIds.length > 0 ? selectedCustomIds : undefined,
        persona: form.persona,
      }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/interview/session/${data.session.id}`);
    else {
      if (data.limitReached) setLimitError(data.error);
      setLoading(false);
    }
  }

  const roundTypes = [
    { value: "technical",     label: "Technical",     desc: "Coding, algorithms, tech concepts" },
    { value: "hr",            label: "HR Round",      desc: "Culture fit, motivation, goals" },
    { value: "behavioral",    label: "Behavioral",    desc: "STAR method, past experiences" },
    { value: "system_design", label: "System Design", desc: "Architecture, scalability" },
  ];

  const aiCount = Math.max(0, form.questionCount - selectedCustomIds.length);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Setup Interview</h1>
        <p className="text-muted-foreground mt-1">Configure your mock interview session</p>
      </div>

      {/* ── Usage / Limit Banner ── */}
      {billing && billing.plan === "free" && (
        <div className={`rounded-xl border px-4 py-3 ${
          (billing.remaining ?? 0) === 0
            ? "border-red-500/40 bg-red-500/10"
            : (billing.remaining ?? 0) <= 2
            ? "border-yellow-500/40 bg-yellow-500/10"
            : "border-border bg-secondary/30"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {(billing.remaining ?? 0) === 0
                  ? "Monthly limit reached"
                  : `${billing.remaining} interview${billing.remaining !== 1 ? "s" : ""} remaining this month`}
              </span>
            </div>
            <Link href="/billing">
              <Badge className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer gap-1">
                <Crown className="h-3 w-3" /> Upgrade
              </Badge>
            </Link>
          </div>
          <Progress value={(billing.used / 5) * 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground mt-1.5">{billing.used}/5 interviews used · Resets monthly</p>
        </div>
      )}

      {/* ── Limit Reached Block ── */}
      {limitError && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-6 text-center space-y-3">
            <Zap className="h-10 w-10 text-red-400 mx-auto" />
            <p className="font-semibold text-red-400">Monthly Limit Reached</p>
            <p className="text-sm text-muted-foreground">{limitError}</p>
            <Button asChild>
              <Link href="/billing"><Crown className="h-4 w-4" /> Upgrade to Pro</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Interview Configuration</CardTitle>
          <CardDescription>Customize your practice session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Role */}
          <div className="space-y-2">
            <Label>Target Role *</Label>
            <Input placeholder="e.g. Senior Frontend Developer" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>

          {/* Resume */}
          {resumes.length > 0 && (
            <div className="space-y-2">
              <Label>Resume (optional)</Label>
              <Select value={form.resumeId} onValueChange={(v) => setForm({ ...form, resumeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a resume for personalized questions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No resume (generic questions)</SelectItem>
                  {resumes.map((r) => <SelectItem key={r.id} value={r.id}>{r.fileName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Round Type */}
          <div className="space-y-2">
            <Label>Round Type</Label>
            <div className="grid grid-cols-2 gap-3">
              {roundTypes.map(({ value, label, desc }) => (
                <button key={value} onClick={() => setForm({ ...form, roundType: value })}
                  className={`text-left rounded-lg border p-3 transition-all ${
                    form.roundType === value ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-accent"
                  }`}>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ── AI Interviewer Persona ── */}
          <div className="space-y-3">
            <Label>AI Interviewer Persona</Label>
            {PERSONA_CATEGORIES.map((cat) => (
              <div key={cat.key}>
                <p className="text-xs text-muted-foreground mb-2 font-medium">{cat.label} — {cat.desc}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PERSONAS.filter((p) => p.category === cat.key).map((persona) => (
                    <button
                      key={persona.id}
                      onClick={() => setForm({ ...form, persona: persona.id })}
                      className={`text-left rounded-xl border p-3 transition-all ${
                        form.persona === persona.id
                          ? persona.color
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{persona.emoji}</span>
                        <span className="text-sm font-semibold">{persona.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{persona.tagline}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {/* Selected persona preview */}
            {(() => {
              const p = PERSONAS.find((p) => p.id === form.persona);
              if (!p) return null;
              return (
                <div className={`rounded-xl border p-3 ${p.color}`}>
                  <p className="text-xs font-semibold mb-1">{p.emoji} {p.name} — First message preview:</p>
                  <p className="text-xs text-muted-foreground italic line-clamp-2">"{p.interviewerIntro}"</p>
                </div>
              );
            })()}
          </div>

          {/* Difficulty */}
          <div className="space-y-2">
            <Label>Difficulty Level</Label>            <div className="flex gap-3">
              {["beginner", "intermediate", "advanced"].map((d) => (
                <button key={d} onClick={() => setForm({ ...form, difficulty: d })}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-all ${
                    form.difficulty === d
                      ? d === "beginner" ? "border-green-500 bg-green-500/10 text-green-400"
                        : d === "intermediate" ? "border-yellow-500 bg-yellow-500/10 text-yellow-400"
                        : "border-red-500 bg-red-500/10 text-red-400"
                      : "border-border hover:bg-accent"
                  }`}>{d}</button>
              ))}
            </div>
          </div>

          {/* Question Count */}
          <div className="space-y-2">
            <Label>Total Questions ({form.questionCount})</Label>
            <input type="range" min={3} max={15} value={form.questionCount}
              onChange={(e) => setForm({ ...form, questionCount: Number(e.target.value) })}
              className="w-full accent-violet-600" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>3 (Quick)</span><span>15 (Full)</span>
            </div>
            {/* Mix breakdown */}
            {selectedCustomIds.length > 0 && (
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="flex items-center gap-1 text-violet-400">
                  <BookOpen className="h-3 w-3" /> {selectedCustomIds.length} custom
                </span>
                <span className="text-muted-foreground">+</span>
                <span className="text-blue-400">{aiCount} AI generated</span>
              </div>
            )}
          </div>

          {/* ── Custom Questions from Bank ── */}
          {bankQuestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-violet-400" />
                  Custom Questions from Bank
                  {selectedCustomIds.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">{selectedCustomIds.length} selected</Badge>
                  )}
                </Label>
                <button onClick={() => setShowBank(!showBank)}
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                  {showBank ? "Hide" : "Select"} questions
                </button>
              </div>

              {showBank && (
                <div className="rounded-lg border border-border max-h-64 overflow-y-auto">
                  {bankQuestions.map((q) => {
                    const selected = selectedCustomIds.includes(q.id);
                    return (
                      <button key={q.id} onClick={() => toggleQuestion(q.id)}
                        className={`w-full text-left flex items-start gap-3 px-3 py-2.5 border-b border-border/50 last:border-0 transition-colors ${
                          selected ? "bg-violet-500/10" : "hover:bg-accent"
                        }`}>
                        <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selected ? "border-violet-500 bg-violet-500" : "border-border"
                        }`}>
                          {selected && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-relaxed line-clamp-2">{q.text}</p>
                          <div className="flex gap-1 mt-1">
                            <span className={`text-[10px] border rounded-full px-1.5 py-0.5 ${CAT_COLOR[q.category] ?? ""}`}>{q.category}</span>
                            <span className="text-[10px] text-muted-foreground">{q.difficulty}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected chips */}
              {selectedCustomIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomIds.map((id) => {
                    const q = bankQuestions.find((bq) => bq.id === id);
                    if (!q) return null;
                    return (
                      <span key={id} className="flex items-center gap-1 text-xs bg-violet-500/15 text-violet-400 border border-violet-500/30 rounded-full px-2 py-0.5">
                        <span className="max-w-[160px] truncate">{q.text.slice(0, 40)}…</span>
                        <button onClick={() => toggleQuestion(id)}><X className="h-3 w-3" /></button>
                      </span>
                    );
                  })}
                  <button onClick={() => setSelectedCustomIds([])}
                    className="text-xs text-muted-foreground hover:text-red-400 px-1">Clear all</button>
                </div>
              )}
            </div>
          )}

          {bankQuestions.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-3 text-center">
              <p className="text-xs text-muted-foreground">No custom questions yet.</p>
              <a href="/question-bank" className="text-xs text-violet-400 hover:underline mt-1 inline-block">
                Add questions to your bank →
              </a>
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleStart}
            disabled={!form.role || loading || (billing?.plan === "free" && (billing?.remaining ?? 1) === 0)}>
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" />Generating Questions…</>
              : (billing?.plan === "free" && (billing?.remaining ?? 1) === 0)
              ? <><Zap className="h-4 w-4" />Limit Reached — Upgrade to Continue</>
              : <><MessageSquare className="h-4 w-4" />Start Interview</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
