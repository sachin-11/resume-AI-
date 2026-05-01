"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Code2, Play, Loader2, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronUp, Copy, Check, Zap, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureMonacoInitialized, resetMonacoLoaderForRetry } from "@/lib/monaco-env";

// Monaco Editor — loaded dynamically (heavy, client-only)
// Workers: `public/monaco/vs` copied by scripts/copy-monaco.cjs (same-origin)
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-[#1e1e1e] rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    ),
  }
);

// ── Types ────────────────────────────────────────────────────────
interface CodeReview {
  score: number;
  verdict: "excellent" | "good" | "average" | "poor";
  correctness: { isCorrect: boolean; issues: string[] };
  complexity: { time: string; space: string; isOptimal: boolean; betterApproach?: string };
  codeQuality: { score: number; positives: string[]; issues: string[] };
  bugs: string[];
  improvements: string[];
  improvedCode: string;
  summary: string;
}

interface CodeEditorProps {
  question: string;
  questionId: string;
  sessionId: string;
  onSubmit: (code: string, review: CodeReview) => void;
  onClose: () => void;
  /** Pair programming: incomplete starter from the question */
  initialCode?: string | null;
  initialLanguage?: string | null;
  /** Debounced hints via /api/interview/code-review quick mode */
  enableLiveCoach?: boolean;
}

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python",     label: "Python" },
  { value: "java",       label: "Java" },
  { value: "cpp",        label: "C++" },
  { value: "go",         label: "Go" },
];

const STARTER_CODE: Record<string, string> = {
  javascript: `// Write your solution here
function solution(input) {
  // Your code here
  
}

// Test your solution
console.log(solution());`,
  typescript: `// Write your solution here
function solution(input: any): any {
  // Your code here
  
}

// Test your solution
console.log(solution());`,
  python: `# Write your solution here
def solution(input):
    # Your code here
    pass

# Test your solution
print(solution(None))`,
  java: `// Write your solution here
public class Solution {
    public static void main(String[] args) {
        // Your code here
    }
}`,
  cpp: `#include <iostream>
using namespace std;

// Write your solution here
int main() {
    // Your code here
    return 0;
}`,
  go: `package main

import "fmt"

// Write your solution here
func solution() {
    // Your code here
}

func main() {
    solution()
    fmt.Println("Done")
}`,
};

// ── Verdict config ───────────────────────────────────────────────
const VERDICT_CONFIG = {
  excellent: { color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30",  label: "Excellent ✨" },
  good:      { color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30",    label: "Good 👍" },
  average:   { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30",label: "Average 🟡" },
  poor:      { color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",      label: "Needs Work ❌" },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-white/10 transition-colors">
      {copied ? <><Check className="h-3 w-3 text-green-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────
export function CodeEditor({
  question,
  questionId,
  sessionId,
  onSubmit,
  onClose,
  initialCode,
  initialLanguage,
  enableLiveCoach = true,
}: CodeEditorProps) {
  const langLocked = Boolean(initialCode?.trim() && initialLanguage);
  const [language, setLanguage] = useState(initialLanguage && LANGUAGES.some((l) => l.value === initialLanguage)
    ? initialLanguage
    : "javascript");
  const [code, setCode] = useState(
    initialCode?.trim()
      ? initialCode
      : STARTER_CODE[initialLanguage && LANGUAGES.some((l) => l.value === initialLanguage) ? initialLanguage : "javascript"]
  );
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<CodeReview | null>(null);
  const [error, setError] = useState("");
  const [showImproved, setShowImproved] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [liveHint, setLiveHint] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<number | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const coachTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [monacoBoot, setMonacoBoot] = useState<"loading" | "ok" | "err">("loading");
  const [monacoBootMsg, setMonacoBootMsg] = useState<string | null>(null);
  const [bootRetry, setBootRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setMonacoBoot("loading");
    setMonacoBootMsg(null);
    ensureMonacoInitialized()
      .then(() => {
        if (alive) setMonacoBoot("ok");
      })
      .catch((e) => {
        if (!alive) return;
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === "object" && "type" in e && (e as { type?: string }).type === "error"
              ? "Worker script failed to load (check Network tab for /monaco/vs). Run: node scripts/copy-monaco.cjs"
              : "Monaco failed to initialize. Run: node scripts/copy-monaco.cjs";
        setMonacoBootMsg(msg);
        setMonacoBoot("err");
      });
    return () => {
      alive = false;
    };
  }, [bootRetry]);

  const handleLanguageChange = useCallback(
    (lang: string) => {
      if (langLocked) return;
      setLanguage(lang);
      setCode(STARTER_CODE[lang] ?? "");
      setReview(null);
    },
    [langLocked]
  );

  useEffect(() => {
    return () => {
      if (coachTimer.current) clearTimeout(coachTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!enableLiveCoach || !editorReady || reviewing) return;
    if (coachTimer.current) clearTimeout(coachTimer.current);
    const stub =
      STARTER_CODE[language] ?? "";
    if (!code.trim() || code.trim() === stub.trim()) {
      setLiveHint(null);
      setLiveProgress(null);
      return;
    }
    coachTimer.current = setTimeout(async () => {
      setLiveLoading(true);
      try {
        const res = await fetch("/api/interview/code-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            code,
            language,
            questionId,
            sessionId,
            quick: true,
          }),
        });
        const data = await res.json();
        if (res.ok && data.quickReview) {
          setLiveHint(data.quickReview.hint ?? null);
          setLiveProgress(
            typeof data.quickReview.progressScore === "number"
              ? data.quickReview.progressScore
              : null
          );
        }
      } catch {
        /* noop */
      } finally {
        setLiveLoading(false);
      }
    }, 2400);
  }, [code, language, question, questionId, sessionId, enableLiveCoach, editorReady, reviewing]);

  async function runReview() {
    if (!code.trim() || code === STARTER_CODE[language]) {
      setError("Write your solution first before submitting for review.");
      return;
    }
    setReviewing(true); setError(""); setReview(null);

    const res = await fetch("/api/interview/code-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, code, language, questionId, sessionId }),
    });
    const data = await res.json();
    setReviewing(false);

    if (!res.ok) { setError(data.error ?? "Review failed"); return; }
    setReview(data.review);
  }

  function handleSubmitAnswer() {
    if (!review) return;
    onSubmit(code, review);
  }

  const verdict = review ? VERDICT_CONFIG[review.verdict] ?? VERDICT_CONFIG.average : null;

  if (monacoBoot === "loading" || monacoBoot === "err") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
              <Code2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">Code Editor</p>
              <p className="text-xs text-muted-foreground truncate max-w-md">{question.slice(0, 80)}…</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          {monacoBoot === "loading" ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
              <p className="text-sm text-muted-foreground">Initializing code editor…</p>
            </>
          ) : (
            <>
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-sm text-center text-muted-foreground max-w-md">
                Code editor assets missing or blocked. From the project root run:
              </p>
              <code className="text-xs bg-zinc-900 border border-border rounded-lg px-3 py-2">node scripts/copy-monaco.cjs</code>
              <p className="text-xs text-muted-foreground">Then restart <code className="bg-secondary px-1 rounded">npm run dev</code> and open again.</p>
              {monacoBootMsg && <p className="text-xs text-red-400/90 text-center max-w-lg">{monacoBootMsg}</p>}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetMonacoLoaderForRetry();
                  setBootRetry((k) => k + 1);
                }}
              >
                Retry
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
            <Code2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">Code Editor{langLocked ? " · pair mode" : ""}</p>
            <p className="text-xs text-muted-foreground truncate max-w-md">{question.slice(0, 80)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Language selector */}
          <select
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
            value={language}
            disabled={langLocked}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className={`flex flex-col ${review ? "w-1/2" : "w-full"} border-r border-border min-h-0`}>
          {(liveHint || liveLoading || liveProgress !== null) && (
            <div className="shrink-0 px-3 py-2 border-b border-border bg-zinc-900/80 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-amber-200/90 font-medium">Live coach</span>
                {liveLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />}
                {liveProgress !== null && !liveLoading && (
                  <span className="text-muted-foreground">{liveProgress}% direction</span>
                )}
              </div>
              {liveHint && <p className="text-zinc-300 leading-snug">{liveHint}</p>}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <MonacoEditor
              height="100%"
              language={language}
              value={code}
              onChange={(val) => setCode(val ?? "")}
              theme="vs-dark"
              onMount={() => setEditorReady(true)}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                lineNumbers: "on",
                renderLineHighlight: "all",
                suggestOnTriggerCharacters: true,
                tabSize: 2,
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
              }}
            />
          </div>

          {/* Bottom bar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-border bg-card">
            <div className="flex items-center gap-2">
              {error && (
                <p className="text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />{error}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={runReview} disabled={reviewing} className="gap-2 bg-violet-600 hover:bg-violet-700">
                {reviewing
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Reviewing...</>
                  : <><Zap className="h-4 w-4" />AI Review Code</>}
              </Button>
              {review && (
                <Button onClick={handleSubmitAnswer} className="gap-2 bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Submit Answer
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Review Panel */}
        {review && verdict && (
          <div className="w-1/2 flex flex-col overflow-y-auto bg-card">
            <div className="p-5 space-y-4">
              {/* Score + Verdict */}
              <div className={`rounded-xl border p-4 flex items-center gap-4 ${verdict.bg}`}>
                <div className="text-center">
                  <div className={`text-4xl font-black ${verdict.color}`}>{review.score}</div>
                  <div className="text-xs text-muted-foreground">/ 100</div>
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-lg ${verdict.color}`}>{verdict.label}</p>
                  <p className="text-sm text-muted-foreground mt-1">{review.summary}</p>
                </div>
              </div>

              {/* Correctness */}
              <div className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {review.correctness.isCorrect
                    ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                    : <XCircle className="h-4 w-4 text-red-400" />}
                  <p className="text-sm font-semibold">
                    {review.correctness.isCorrect ? "Correct Solution" : "Incorrect Solution"}
                  </p>
                </div>
                {review.correctness.issues.map((issue) => (
                  <p key={issue} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">!</span>{issue}
                  </p>
                ))}
              </div>

              {/* Complexity */}
              <div className="rounded-xl border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Complexity</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary p-2 text-center">
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="font-bold text-sm text-violet-400">{review.complexity.time}</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-2 text-center">
                    <p className="text-xs text-muted-foreground">Space</p>
                    <p className="font-bold text-sm text-blue-400">{review.complexity.space}</p>
                  </div>
                </div>
                {!review.complexity.isOptimal && review.complexity.betterApproach && (
                  <p className="text-xs text-yellow-400 flex items-start gap-1">
                    <Zap className="h-3 w-3 mt-0.5 shrink-0" />{review.complexity.betterApproach}
                  </p>
                )}
              </div>

              {/* Code Quality */}
              <div className="rounded-xl border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Code Quality — {review.codeQuality.score}/100
                </p>
                {review.codeQuality.positives.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-400 mb-1">✅ Good</p>
                    {review.codeQuality.positives.map((p) => (
                      <p key={p} className="text-xs text-muted-foreground flex items-start gap-1">
                        <span className="text-green-400">•</span>{p}
                      </p>
                    ))}
                  </div>
                )}
                {review.codeQuality.issues.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-400 mb-1">⚠️ Issues</p>
                    {review.codeQuality.issues.map((i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                        <span className="text-red-400">•</span>{i}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Bugs */}
              {review.bugs.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-1">
                  <p className="text-xs font-semibold text-red-400">🐛 Bugs Found</p>
                  {review.bugs.map((b) => (
                    <p key={b} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-red-400">!</span>{b}
                    </p>
                  ))}
                </div>
              )}

              {/* Improvements */}
              {review.improvements.length > 0 && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-1">
                  <p className="text-xs font-semibold text-yellow-400">💡 Improvements</p>
                  {review.improvements.map((imp) => (
                    <p key={imp} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-yellow-400">→</span>{imp}
                    </p>
                  ))}
                </div>
              )}

              {/* Improved Code */}
              {review.improvedCode && (
                <div className="rounded-xl border border-green-500/20 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-green-400 hover:bg-green-500/5 transition-colors"
                    onClick={() => setShowImproved(!showImproved)}
                  >
                    <span>✨ View Improved Code</span>
                    {showImproved ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {showImproved && (
                    <div className="border-t border-green-500/20">
                      <div className="flex justify-end px-3 py-1 bg-[#1e1e1e]">
                        <CopyButton text={review.improvedCode} />
                      </div>
                      <MonacoEditor
                        height="200px"
                        language={language}
                        value={review.improvedCode}
                        theme="vs-dark"
                        options={{
                          readOnly: true, fontSize: 12, minimap: { enabled: false },
                          scrollBeyondLastLine: false, lineNumbers: "off",
                          padding: { top: 8, bottom: 8 },
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
