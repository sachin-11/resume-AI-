"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Send, Loader2, Bot, User, Flag, CheckCircle,
  Volume2, VolumeX, Mic, MicOff, AudioLines, StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getDifficultyColor, getRoundTypeLabel } from "@/lib/utils";
import { useTTS, useSTT } from "@/hooks/use-speech";

interface Question {
  id: string;
  text: string;
  type: string;
  orderIndex: number;
  source?: "resume" | "general"; // from AI generation
}
interface SessionData {
  id: string; title: string; role: string;
  difficulty: string; roundType: string; status: string;
  questions: Question[];
}
interface ChatMessage { id: string; role: "assistant" | "user"; content: string; source?: "resume" | "general"; }

export default function InterviewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep latest submit fn accessible inside STT callback
  const submitRef = useRef<((text: string) => void) | null>(null);

  // ── TTS ──────────────────────────────────────────────────────
  const { speak, stop: stopSpeaking, speaking, enabled: ttsEnabled, setEnabled: setTtsEnabled } = useTTS();
  const lastSpokenId = useRef("");

  useEffect(() => {
    if (!ttsEnabled) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.id !== lastSpokenId.current) {
      lastSpokenId.current = last.id;
      speak(last.content);
    }
  }, [messages, ttsEnabled, speak]);

  // ── STT ──────────────────────────────────────────────────────
  const handleInterim = useCallback((text: string) => setAnswer(text), []);

  // Auto-submit fires when silence detected
  const handleAutoSubmit = useCallback((text: string) => {
    submitRef.current?.(text);
  }, []);

  const { start: startMic, stop: stopMic, listening, supported: micSupported, countdown, canSubmit, cancelAutoSubmit } = useSTT({
    onInterim: handleInterim,
    onAutoSubmit: handleAutoSubmit,
    silenceMs: 4000,   // 4 seconds — enough time for natural pauses
    minWords: 4,       // must say at least 4 words before auto-submit kicks in
  });

  // ── Core submit logic ────────────────────────────────────────
  const doSubmit = useCallback(async (text: string) => {
    if (!text.trim() || !session) return;
    stopMic();
    stopSpeaking();
    setAnswer("");
    setSubmitting(true);

    // Capture current session state via ref to avoid stale closure
    const currentQ = session.questions[currentIndex];

    setMessages((p) => [...p, { id: `user-${Date.now()}`, role: "user", content: text.trim() }]);

    const res = await fetch("/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: currentQ.id, answerText: text.trim(), sessionId: id }),
    });
    const data = await res.json();
    const next = currentIndex + 1;

    if (data.followupQuestion) {
      setSession((p) => p ? { ...p, questions: [...p.questions, data.followupQuestion] } : p);
      setMessages((p) => [...p, { id: `q-${data.followupQuestion.id}`, role: "assistant", content: data.followupQuestion.text, source: undefined }]);
      setCurrentIndex(next);
    } else if (next < session.questions.length) {
      const nq = session.questions[next];
      setMessages((p) => [...p, { id: `q-${nq.id}`, role: "assistant", content: nq.text, source: nq.source }]);
      setCurrentIndex(next);
    } else {
      setDone(true);
      setMessages((p) => [...p, {
        id: "complete", role: "assistant",
        content: "Great job! You've answered all the questions. Click 'Get Scorecard' to see your detailed performance report.",
      }]);
    }
    setSubmitting(false);
    // If TTS is off, restart mic immediately after answer is processed
    if (!ttsEnabled && micSupported && !done) {
      setTimeout(() => startMic(), 400);
    }
  }, [session, currentIndex, id, stopMic, stopSpeaking, ttsEnabled, micSupported, done, startMic]);

  // ── Auto-restart mic after AI finishes speaking ──────────────
  // When TTS stops speaking AND we're not submitting AND not done → restart mic
  const prevSpeaking = useRef(false);
  useEffect(() => {
    // speaking just changed from true → false (AI finished talking)
    if (prevSpeaking.current && !speaking && !submitting && !done && micSupported && !listening) {
      // Small delay so the user knows AI is done
      const t = setTimeout(() => startMic(), 600);
      return () => clearTimeout(t);
    }
    prevSpeaking.current = speaking;
  }, [speaking, submitting, done, micSupported, listening, startMic]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, submitting]);
  useEffect(() => {
    fetch(`/api/interview/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const s: SessionData = d.session;
        setSession(s);

        // Extract candidate name from user session
        const candidateName: string = d.session.user?.name ?? "";
        const firstName = candidateName.split(" ")[0] ?? "";

        const msgs: ChatMessage[] = [{
          id: "intro", role: "assistant",
          content: `Hello${firstName ? ` ${firstName}` : ""}! Welcome to your ${getRoundTypeLabel(s.roundType)}. I'll be your AI interviewer today. I've reviewed your background and prepared ${s.questions.length} questions for you. Take your time with each answer. Let's begin!`,
        }];
        const qs = d.session.questions as Array<Question & { answers: Array<{ text: string }> }>;
        let lastAnswered = -1;
        qs.forEach((q, i) => {
          if (q.answers?.length > 0) {
            msgs.push({ id: `q-${q.id}`, role: "assistant", content: q.text, source: q.source });
            msgs.push({ id: `a-${q.id}`, role: "user", content: q.answers[0].text });
            lastAnswered = i;
          }
        });
        const next = lastAnswered + 1;
        if (next < s.questions.length) {
          msgs.push({ id: `q-${s.questions[next].id}`, role: "assistant", content: s.questions[next].text, source: s.questions[next].source });
          setCurrentIndex(next);
        } else setDone(true);
        setMessages(msgs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Keep ref in sync
  useEffect(() => { submitRef.current = doSubmit; }, [doSubmit]);

  // ── End interview ────────────────────────────────────────────
  async function handleEndInterview() {
    stopMic(); stopSpeaking(); setFinishing(true);
    await fetch("/api/interview/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    });
    const res = await fetch("/api/feedback/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    });
    if (res.ok) router.push(`/feedback/${id}`);
    else setFinishing(false);
  }

  const totalQ = session?.questions.length ?? 0;
  const answered = done ? totalQ : currentIndex;
  const progress = totalQ > 0 ? (answered / totalQ) * 100 : 0;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!session) return <div className="text-center text-muted-foreground py-16">Session not found</div>;

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>

      {/* ── Header ── */}
      <div className="shrink-0 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-bold text-lg truncate">{session.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className={getDifficultyColor(session.difficulty)}>{session.difficulty}</Badge>
              <Badge variant="outline">{getRoundTypeLabel(session.roundType)}</Badge>
              <span className="text-xs text-muted-foreground">{answered}/{totalQ} answered</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* TTS toggle */}
            <button
              onClick={() => { if (ttsEnabled) stopSpeaking(); setTtsEnabled(!ttsEnabled); }}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all ${
                ttsEnabled ? "border-violet-500 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {speaking ? <AudioLines className="h-3.5 w-3.5 animate-pulse" /> : ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{speaking ? "Speaking…" : ttsEnabled ? "Voice On" : "Voice Off"}</span>
            </button>

            {/* End interview */}
            {!confirmEnd ? (
              <button
                onClick={() => setConfirmEnd(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-all"
              >
                <StopCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">End Interview</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Sure?</span>
                <button onClick={handleEndInterview} disabled={finishing}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-all">
                  {finishing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, End"}
                </button>
                <button onClick={() => setConfirmEnd(false)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium border border-border hover:bg-accent transition-all">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        <Progress value={progress} className="mt-3" />
      </div>

      {/* ── Chat ── */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${msg.role === "assistant" ? "bg-violet-600" : "bg-secondary"}`}>
              {msg.role === "assistant" ? <Bot className="h-4 w-4 text-white" /> : <User className="h-4 w-4" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "assistant" ? "bg-card border border-border rounded-tl-sm" : "bg-violet-600 text-white rounded-tr-sm"
            }`}>
              {/* Source badge for questions */}
              {msg.role === "assistant" && msg.source && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-2 mr-1 ${
                  msg.source === "resume"
                    ? "bg-violet-500/20 text-violet-400"
                    : "bg-blue-500/20 text-blue-400"
                }`}>
                  {msg.source === "resume" ? "📄 From your resume" : "💡 General question"}
                </span>
              )}
              {msg.content}
              {msg.role === "assistant" && ttsEnabled && (
                <button onClick={() => speak(msg.content)} className="ml-2 opacity-30 hover:opacity-80 transition-opacity inline-flex" title="Replay">
                  <Volume2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Typing dots */}
        {submitting && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 pt-4">
        {!done ? (
          <>
            <div className="flex gap-2 items-end">

              {/* Mic button with countdown */}
              {micSupported && (
                <div className="relative flex flex-col items-center">
                  <button
                    onClick={listening ? stopMic : startMic}
                    disabled={submitting}
                    className={`relative flex h-[90px] w-11 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-medium transition-all ${
                      listening
                        ? "border-red-500 bg-red-500/10 text-red-400"
                        : "border-border hover:bg-accent text-muted-foreground"
                    }`}
                  >
                    {listening ? (
                      <>
                        <MicOff className="h-5 w-5" />
                        {/* Show countdown only when canSubmit */}
                        {canSubmit && countdown > 0 ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {countdown}
                          </span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        )}
                      </>
                    ) : (
                      <>
                        <Mic className="h-5 w-5" />
                        <span className="text-[10px]">{ttsEnabled ? "Auto" : "Speak"}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex-1 flex gap-2 items-end">
                <div className="flex-1 relative">
                  <Textarea
                    placeholder={
                      listening
                        ? "🎤 Listening… auto-sends when you stop speaking"
                        : "Type your answer or click Speak…"
                    }
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className={`min-h-[90px] max-h-[200px] resize-none transition-colors ${
                      listening ? "border-red-500/50 bg-red-500/5" : ""
                    }`}
                    disabled={submitting}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) doSubmit(answer); }}
                  />
                  {/* Auto-send countdown bar — only shows when canSubmit */}
                  {listening && canSubmit && countdown > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-lg bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-orange-400 transition-all duration-1000"
                        style={{ width: `${(countdown / Math.ceil(4000 / 1000)) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => doSubmit(answer)}
                  disabled={!answer.trim() || submitting}
                  size="icon"
                  className="h-[90px] w-12 shrink-0"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                <kbd className="px-1 py-0.5 rounded bg-secondary text-xs">Ctrl+Enter</kbd> to submit manually
              </p>
              {listening && (
                <div className="flex items-center gap-2">
                  {canSubmit && countdown > 0 ? (
                    // Countdown active — show cancel button
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-orange-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
                        Sending in {countdown}s…
                      </p>
                      <button
                        onClick={cancelAutoSubmit}
                        className="text-xs px-2 py-0.5 rounded-md border border-orange-400/50 text-orange-400 hover:bg-orange-400/10 transition-all font-medium"
                      >
                        Wait, I&apos;m not done
                      </button>
                    </div>
                  ) : (
                    // Still speaking or not enough words yet
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
                      {!canSubmit ? "Keep speaking… (need a few more words)" : "Recording…"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-4">
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-400">Interview complete!</p>
              <p className="text-xs text-muted-foreground mt-0.5">Your AI scorecard is ready</p>
            </div>
            <Button onClick={handleEndInterview} disabled={finishing} className="shrink-0">
              {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Get Scorecard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
