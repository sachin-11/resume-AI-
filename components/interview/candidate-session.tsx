"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Send, Loader2, Bot, User, Flag, CheckCircle,
  Volume2, VolumeX, Mic, MicOff, AudioLines, UserRound,
  Camera, CameraOff, VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useTTS, useSTT } from "@/hooks/use-speech";
import { useCamera } from "@/hooks/use-camera";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useProctoring } from "@/hooks/use-proctoring";
import { UI_STRINGS, LANGUAGES, type SupportedLang } from "@/lib/i18n";

interface Question { id: string; text: string; type: string; orderIndex: number; }
interface ChatMessage { id: string; role: "assistant" | "user"; content: string; }

interface Props {
  sessionId: string;
  token: string;
  candidateName: string;
  language?: SupportedLang;
  onComplete: () => void;
}

export function CandidateInterviewSession({ sessionId, token, candidateName, language = "en", onComplete }: Props) {
  const t = UI_STRINGS[language] ?? UI_STRINGS.en; // translations shorthand
  const [questions, setQuestions] = useState<Question[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<((t: string) => void) | null>(null);
  const doneRef = useRef(false); // track if completed to skip abandon

  // ── Abandon on tab close ─────────────────────────────────────
  useEffect(() => {
    function handleBeforeUnload() {
      // Only mark abandoned if not already completed
      if (!doneRef.current && sessionId) {
        // sendBeacon works even when tab is closing
        navigator.sendBeacon(
          "/api/interview/public/complete",
          JSON.stringify({ sessionId, token, action: "abandon" })
        );
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sessionId, token]);

  const { speak, stop: stopSpeaking, speaking, enabled: ttsEnabled, setEnabled: setTtsEnabled, voiceGender, setVoiceGender } = useTTS("male", LANGUAGES[language]?.sttCode?.split("-")[0] ?? "en");
  const lastSpokenId = useRef("");
  const prevSpeaking = useRef(false);

  // ── Tab switch / focus loss detection ───────────────────────
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const tabSwitchRef = useRef(0);

  useEffect(() => {
    if (!sessionId) return;

    function handleVisibilityChange() {
      if (document.hidden && !doneRef.current) {
        tabSwitchRef.current += 1;
        setTabSwitchCount(tabSwitchRef.current);
        setShowTabWarning(true);
        navigator.sendBeacon(
          "/api/interview/public/tab-switch",
          JSON.stringify({ sessionId })
        );
      }
    }

    function handleBlur() {
      if (!doneRef.current && !document.hidden) {
        tabSwitchRef.current += 1;
        setTabSwitchCount(tabSwitchRef.current);
        setShowTabWarning(true);
        fetch("/api/interview/public/tab-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }).catch(() => {});
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [sessionId]);

  // Auto-hide warning after 4 seconds
  useEffect(() => {
    if (!showTabWarning) return;
    const t = setTimeout(() => setShowTabWarning(false), 4000);
    return () => clearTimeout(t);
  }, [showTabWarning, tabSwitchCount]);

  // ── Camera ───────────────────────────────────────────────────
  const { status: camStatus, enabled: camEnabled, toggleCamera, attachVideo, capturePhoto } = useCamera();
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // ── Proctoring ───────────────────────────────────────────────
  const [proctoringWarning, setProctoringWarning] = useState<string | null>(null);
  const [integrityFlag, setIntegrityFlag] = useState<"clean" | "warning" | "suspicious">("clean");

  const { stats: procStats, start: startProctoring, stop: stopProctoring, faceDetectionSupported } = useProctoring({
    sessionId,
    videoRef: videoElRef,
    enabled: !done,
    onViolation: (event) => {
      setProctoringWarning(event.message);
      setTimeout(() => setProctoringWarning(null), 4000);
    },
    onFlagChange: (flag, total) => {
      setIntegrityFlag(flag);
      if (flag === "warning") {
        setProctoringWarning(`⚠️ ${total} violations detected. Please follow interview guidelines.`);
        setTimeout(() => setProctoringWarning(null), 6000);
      } else if (flag === "suspicious") {
        setProctoringWarning(`🚨 Your session has been flagged as suspicious (${total} violations). This will be reported to the recruiter.`);
        // Don't auto-hide suspicious warning
      }
    },
  });

  // Start proctoring when camera turns on
  useEffect(() => {
    if (camEnabled) startProctoring();
    else stopProctoring();
  }, [camEnabled, startProctoring, stopProctoring]);

  // ── Audio Recorder ───────────────────────────────────────────
  const { start: startRecording, stopAndUpload, status: recorderStatus } = useAudioRecorder();

  // Auto-start recording when session loads
  useEffect(() => {
    if (!loading && questions.length > 0 && recorderStatus === "idle") {
      startRecording();
    }
  }, [loading, questions.length, recorderStatus, startRecording]);

  useEffect(() => {
    if (!ttsEnabled) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.id !== lastSpokenId.current) {
      lastSpokenId.current = last.id;
      speak(last.content);
    }
  }, [messages, ttsEnabled, speak]);

  const handleInterim = useCallback((t: string) => setAnswer(t), []);
  const handleAutoSubmit = useCallback((t: string) => submitRef.current?.(t), []);
  const { start: startMic, stop: stopMic, listening, supported: micSupported, countdown, canSubmit, cancelAutoSubmit } = useSTT({
    onInterim: handleInterim,
    onAutoSubmit: handleAutoSubmit,
    silenceMs: 4000,
    minWords: 4,
    lang: LANGUAGES[language]?.sttCode ?? "en-US",
  });

  // Auto-restart mic after AI finishes speaking
  useEffect(() => {
    if (prevSpeaking.current && !speaking && !submitting && !done && micSupported && !listening) {
      const t = setTimeout(() => startMic(), 600);
      return () => clearTimeout(t);
    }
    prevSpeaking.current = speaking;
  }, [speaking, submitting, done, micSupported, listening, startMic]);

  // Load session using PUBLIC endpoint (no auth needed)
  useEffect(() => {
    fetch(`/api/interview/public/${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const qs: Question[] = d.session?.questions ?? [];
        if (qs.length === 0) return;
        setQuestions(qs);
        const firstName = candidateName?.split(" ")[0] ?? "";
        const msgs: ChatMessage[] = [{
          id: "intro", role: "assistant",
          content: `Hello${firstName ? ` ${firstName}` : ""}! Welcome to your AI interview. I'll ask you ${qs.length} questions. Take your time and answer clearly. Let's begin!`,
        }];
        msgs.push({ id: `q-${qs[0].id}`, role: "assistant", content: qs[0].text });
        setMessages(msgs);
      })
      .catch((err) => console.error("Failed to load session:", err))
      .finally(() => setLoading(false));
  }, [sessionId, candidateName]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, submitting]);

  const doSubmit = useCallback(async (text: string) => {
    if (!text.trim() || submitting || questions.length === 0) return;
    stopMic(); stopSpeaking();
    const currentQ = questions[currentIndex];
    setAnswer("");
    setSubmitting(true);
    setMessages((p) => [...p, { id: `user-${Date.now()}`, role: "user", content: text.trim() }]);

    // ── End intent detection ──
    const endPhrases = /\b(end|finish|stop|quit|done|that'?s? all|i'?m done|wrap up|let'?s end|can we end|want to end|would like to end|please end)\b/i;
    if (endPhrases.test(text.trim())) {
      const goodbye = `Thank you so much for your time${candidateName ? `, ${candidateName.split(" ")[0]}` : ""}! It was a pleasure speaking with you. Your responses have been recorded — you'll receive your feedback shortly. Best of luck! 🎉`;
      setMessages((p) => [...p, { id: "goodbye", role: "assistant", content: goodbye }]);
      setSubmitting(false);
      setDone(true);
      setTimeout(() => handleFinish(), ttsEnabled ? 4000 : 1500);
      return;
    }

    await fetch("/api/interview/public/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: currentQ.id, answerText: text.trim(), sessionId }),
    });

    const next = currentIndex + 1;
    if (next < questions.length) {
      setMessages((p) => [...p, { id: `q-${questions[next].id}`, role: "assistant", content: questions[next].text }]);
      setCurrentIndex(next);
    } else {
      setDone(true);
      doneRef.current = false;
      setMessages((p) => [...p, {
        id: "done", role: "assistant",
        content: `Excellent work${candidateName ? `, ${candidateName.split(" ")[0]}` : ""}! You've completed all the questions. Your responses have been recorded. Click 'Submit Interview' to finish.`,
      }]);
    }
    setSubmitting(false);
    if (!ttsEnabled && micSupported && next < questions.length) setTimeout(() => startMic(), 400);
  }, [submitting, questions, currentIndex, sessionId, stopMic, stopSpeaking, ttsEnabled, micSupported, startMic, candidateName]);

  useEffect(() => { submitRef.current = doSubmit; }, [doSubmit]);

  async function handleFinish() {
    stopMic(); stopSpeaking(); setFinishing(true);
    doneRef.current = true; // prevent abandon on unload

    // Capture photo snapshot before camera stops
    const photoDataUrl = capturePhoto();

    // Stop recording + upload audio + complete API — all in parallel
    await Promise.all([
      fetch("/api/interview/public/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, token, action: "complete" }),
      }),
      stopAndUpload(sessionId).catch(() => {}),
    ]);

    // Save photo if captured (non-blocking)
    if (photoDataUrl) {
      fetch("/api/interview/public/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, token, photoDataUrl }),
      }).catch(() => {});
    }

    onComplete();
  }

  const progress = questions.length > 0 ? ((done ? questions.length : currentIndex) / questions.length) * 100 : 0;

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Interviewer</p>
            <p className="text-xs text-muted-foreground">{done ? questions.length : currentIndex}/{questions.length} answered</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Recording indicator */}
          {recorderStatus === "recording" && (
            <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border border-red-500/40 bg-red-500/10">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-medium hidden sm:inline">Recording</span>
            </div>
          )}
          {recorderStatus === "uploading" && (
            <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border border-yellow-500/40 bg-yellow-500/10">
              <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
              <span className="text-xs text-yellow-400 font-medium hidden sm:inline">Saving…</span>
            </div>
          )}
          {/* Voice gender toggle */}
          {ttsEnabled && (
            <button
              onClick={() => { stopSpeaking(); setVoiceGender(voiceGender === "male" ? "female" : "male"); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:bg-accent transition-all"
              title="Switch interviewer voice"
            >
              <UserRound className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{voiceGender === "male" ? "♂ Male" : "♀ Female"}</span>
            </button>
          )}
          {/* TTS toggle */}
          <button
            onClick={() => { if (ttsEnabled) stopSpeaking(); setTtsEnabled(!ttsEnabled); }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all ${
              ttsEnabled ? "border-violet-500 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground"
            }`}
          >
            {speaking ? <AudioLines className="h-3.5 w-3.5 animate-pulse" /> : ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{speaking ? "Speaking…" : ttsEnabled ? "Voice On" : "Voice Off"}</span>
          </button>
          {/* Camera toggle */}
          <button
            onClick={toggleCamera}
            disabled={camStatus === "denied"}
            title={camEnabled ? "Turn off camera" : "Turn on camera"}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all ${
              camEnabled
                ? "border-green-500 bg-green-500/10 text-green-400"
                : camStatus === "denied"
                ? "border-red-500/40 text-red-400 cursor-not-allowed opacity-60"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {camEnabled ? <Camera className="h-3.5 w-3.5" /> : camStatus === "denied" ? <VideoOff className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {camEnabled ? "Cam On" : camStatus === "denied" ? "Blocked" : "Camera"}
            </span>
          </button>
        </div>
      </div>
      <Progress value={progress} className="h-1 rounded-none" />

      {/* ── Tab Switch Warning ── */}
      {showTabWarning && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 animate-in slide-in-from-top-2">
          <span className="text-xl">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">Tab switch detected!</p>
            <p className="text-xs text-muted-foreground">
              Please stay on this page during the interview. This has been recorded ({tabSwitchCount} time{tabSwitchCount > 1 ? "s" : ""}).
            </p>
          </div>
          <button onClick={() => setShowTabWarning(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Proctoring Warning ── */}
      {proctoringWarning && (
        <div className={`mx-4 mt-2 flex items-center gap-3 rounded-xl border px-4 py-3 animate-in slide-in-from-top-2 ${
          integrityFlag === "suspicious"
            ? "border-red-500/60 bg-red-500/15"
            : "border-orange-500/40 bg-orange-500/10"
        }`}>
          <span className="text-xl">{integrityFlag === "suspicious" ? "🚨" : "🔍"}</span>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${integrityFlag === "suspicious" ? "text-red-400" : "text-orange-400"}`}>
              {integrityFlag === "suspicious" ? "Session Flagged" : "Proctoring Alert"}
            </p>
            <p className="text-xs text-muted-foreground">{proctoringWarning}</p>
          </div>
          {integrityFlag !== "suspicious" && (
            <button onClick={() => setProctoringWarning(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
          )}
        </div>
      )}
      {camEnabled && (
        <div className="fixed bottom-24 right-4 z-50 group">
          <div className="relative rounded-2xl overflow-hidden border-2 border-green-500/50 shadow-2xl shadow-black/40 bg-black"
            style={{ width: 200, height: 150 }}>
            <video
              ref={(el) => { attachVideo(el); videoElRef.current = el; }}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]" // mirror effect
            />
            {/* Live indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-white font-medium">LIVE</span>
            </div>
            {/* Close button */}
            <button
              onClick={toggleCamera}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded-full p-1 text-white hover:bg-red-500/80"
            >
              <CameraOff className="h-3 w-3" />
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-1">You</p>
        </div>
      )}

      {/* Camera permission denied toast */}
      {camStatus === "denied" && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          <VideoOff className="h-3.5 w-3.5 shrink-0" />
          Camera access blocked. Please allow camera in browser settings and refresh.
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-4 py-6 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${msg.role === "assistant" ? "bg-violet-600" : "bg-secondary"}`}>
              {msg.role === "assistant" ? <Bot className="h-4 w-4 text-white" /> : <User className="h-4 w-4" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "assistant" ? "bg-card border border-border rounded-tl-sm" : "bg-violet-600 text-white rounded-tr-sm"
            }`}>
              {msg.content}
              {msg.role === "assistant" && ttsEnabled && (
                <button onClick={() => speak(msg.content)} className="ml-2 opacity-30 hover:opacity-80 transition-opacity inline-flex">
                  <Volume2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
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

      {/* Input */}
      <div className="border-t border-border px-4 py-4 max-w-2xl w-full mx-auto">
        {!done ? (
          <>
            <div className="flex gap-2 items-end">
              {micSupported && (
                <button
                  onClick={listening ? stopMic : startMic}
                  disabled={submitting}
                  className={`flex h-[80px] w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-medium transition-all ${
                    listening ? "border-red-500 bg-red-500/10 text-red-400" : "border-border hover:bg-accent text-muted-foreground"
                  }`}
                >
                  {listening ? (
                    <>
                      <MicOff className="h-5 w-5" />
                      {canSubmit && countdown > 0 ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">{countdown}</span>
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
              )}
              <div className="flex-1 relative">
                <Textarea
                  placeholder={listening ? "🎤 Listening… auto-sends when you stop" : "Type your answer or click Speak…"}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className={`min-h-[80px] resize-none ${listening ? "border-red-500/50 bg-red-500/5" : ""}`}
                  disabled={submitting}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSubmit(answer); } }}
                />
                {listening && canSubmit && countdown > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-lg bg-secondary overflow-hidden">
                    <div className="h-full bg-orange-400 transition-all duration-1000" style={{ width: `${(countdown / 4) * 100}%` }} />
                  </div>
                )}
              </div>
              <Button onClick={() => doSubmit(answer)} disabled={!answer.trim() || submitting} size="icon" className="h-[80px] w-12 shrink-0">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground"><kbd className="px-1 py-0.5 rounded bg-secondary text-xs">Enter</kbd> to submit · <kbd className="px-1 py-0.5 rounded bg-secondary text-xs">Shift+Enter</kbd> for newline</p>
              {listening && canSubmit && countdown > 0 && (
                <button onClick={cancelAutoSubmit} className="text-xs px-2 py-0.5 rounded border border-orange-400/50 text-orange-400 hover:bg-orange-400/10">
                  Wait, I&apos;m not done
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-4">
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-400">All questions answered!</p>
              <p className="text-xs text-muted-foreground">Submit to complete your interview</p>
            </div>
            <Button onClick={handleFinish} disabled={finishing}>
              {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Submit Interview
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
