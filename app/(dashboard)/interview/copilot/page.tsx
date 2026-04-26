"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSTT } from "@/hooks/use-speech";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Mic, MicOff, ChevronDown, ChevronUp, Headphones, AlertCircle } from "lucide-react";

type HistoryItem = { id: string; q: string; a: string };

const ANSWER_PREVIEW_CHARS = 420;

export default function InterviewCopilotPage() {
  const [liveTranscript, setLiveTranscript] = useState("");
  const [continuous, setContinuous] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastQ, setLastQ] = useState<string | null>(null);
  const [lastA, setLastA] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  const processingRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  const continuousRef = useRef(continuous);
  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  const runProcess = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (t.length < 8) return;

      if (processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      setError(null);

      try {
        const res = await fetch("/api/interview/copilot/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: t }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Request failed");
          return;
        }
        if (data.action === "skip") {
          return;
        }
        if (data.action === "answer" && data.question && data.answer) {
          setLastQ(data.question);
          setLastA(data.answer);
          setAnswerExpanded(false);
          setHistory((prev) => {
            const item: HistoryItem = {
              id: `${Date.now()}`,
              q: data.question,
              a: data.answer,
            };
            return [item, ...prev].slice(0, 8);
          });
        }
      } catch {
        setError("Network error. Check connection and try again.");
      } finally {
        processingRef.current = false;
        setProcessing(false);
        if (continuousRef.current) {
          window.setTimeout(() => startRef.current(), 500);
        }
      }
    },
    []
  );

  const handleInterim = useCallback((t: string) => setLiveTranscript(t), []);

  const { start, stop, listening, supported, countdown, canSubmit, sttError, clearSttError } =
    useSTT({
      onInterim: handleInterim,
      onAutoSubmit: runProcess,
      silenceMs: 3500,
      minWords: 3,
      lang: "en-US",
    });

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const handleProcessManual = useCallback(() => {
    if (!liveTranscript.trim() || liveTranscript.trim().length < 8) {
      setError("Speak or wait until at least a short phrase is captured, then try again.");
      return;
    }
    stop();
    void runProcess(liveTranscript);
  }, [liveTranscript, runProcess, stop]);

  const toggleListen = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    clearSttError();
    setError(null);
    start();
  }, [listening, start, stop, clearSttError]);

  return (
    <div className="min-h-[calc(100vh-4rem)] -mx-4 -mb-4 px-4 pb-8 bg-zinc-950 text-zinc-100 sm:mx-0 sm:mb-0 sm:rounded-2xl sm:border sm:border-zinc-800/80">
      <div className="max-w-md mx-auto pt-2 space-y-4">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-violet-400">
            <Headphones className="h-6 w-6 shrink-0" />
            <h1 className="text-lg font-semibold tracking-tight">AI Interview Copilot</h1>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">Mock &amp; personal practice only.</strong> Place your device where it can
            hear the question audio (e.g. from your call speakers). Suggested answers are silent — no sound from this
            page. Follow your interview host&apos;s rules and applicable laws.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border",
              listening
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "bg-zinc-800/80 text-zinc-400 border-zinc-700"
            )}
          >
            <span
              className={cn("h-2 w-2 rounded-full", listening ? "bg-emerald-400 animate-pulse" : "bg-zinc-600")}
            />
            {listening ? "Listening" : "Mic off"}
            {countdown > 0 ? ` · ${countdown}s` : ""}
          </div>
          {processing && (
            <span className="inline-flex items-center gap-1 text-xs text-violet-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating…
            </span>
          )}
        </div>

        {!supported && (
          <p className="text-xs text-amber-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            Speech recognition is not available in this browser. Try Chrome on Android/desktop, or type in another app
            and paste (manual button still works for pasted text in transcript if your browser allows).
          </p>
        )}

        {sttError && (
          <p className="text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {sttError}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={toggleListen}
            disabled={!supported}
            className={cn(
              "flex-1 min-w-[8rem] gap-2",
              listening ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-violet-600 hover:bg-violet-500"
            )}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {listening ? "Pause listening" : "Start listening"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleProcessManual}
            disabled={processing || !liveTranscript.trim()}
            className="border-zinc-600 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            Use transcript now
          </Button>
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={continuous}
            onChange={(e) => setContinuous(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900"
          />
          After each answer, resume listening (continuous practice)
        </label>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 min-h-[4.5rem]">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Live transcript</p>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words min-h-[3rem]">
            {liveTranscript || (listening ? "…" : "Tap Start and let your device capture speech after the mic prompt.")}
          </p>
          {listening && canSubmit && <p className="text-[10px] text-zinc-500 mt-1">Release speaking → silence ~3.5s to send for analysis</p>}
        </div>

        {lastQ && lastA && (
          <section className="rounded-xl border border-violet-500/30 bg-zinc-900/80 p-4 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Latest question</p>
            <p className="text-sm text-zinc-200 font-medium leading-relaxed">Q: {lastQ}</p>
            <div className="h-px bg-zinc-800" />
            <p className="text-[10px] uppercase tracking-wider text-violet-400/90">Suggested answer</p>
            <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {answerExpanded || lastA.length <= ANSWER_PREVIEW_CHARS ? (
                lastA
              ) : (
                <>
                  {lastA.slice(0, ANSWER_PREVIEW_CHARS)}…
                  <button
                    type="button"
                    onClick={() => setAnswerExpanded(true)}
                    className="mt-2 flex items-center gap-1 text-violet-400 text-xs font-medium"
                  >
                    Read more
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {answerExpanded && lastA.length > ANSWER_PREVIEW_CHARS && (
                <button
                  type="button"
                  onClick={() => setAnswerExpanded(false)}
                  className="mt-2 flex items-center gap-1 text-zinc-500 text-xs"
                >
                  Show less
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </section>
        )}

        {history.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 w-full text-left py-1"
            >
              {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Previous Q&amp;A ({history.length})
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-3 max-h-64 overflow-y-auto pr-1">
                {history.map((item) => (
                  <li key={item.id} className="rounded-lg border border-zinc-800 bg-black/20 p-3 text-xs">
                    <p className="text-zinc-400 font-medium mb-1">Q: {item.q}</p>
                    <p className="text-zinc-500 whitespace-pre-wrap line-clamp-4">{item.a}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-[10px] text-zinc-600 text-center">TTS is off. No sound plays from this page.</p>
      </div>
    </div>
  );
}
