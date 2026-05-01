"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Send, Loader2, Bot, User, Flag, CheckCircle,
  Volume2, VolumeX, Mic, MicOff, AudioLines, StopCircle, UserRound,
  Camera, CameraOff, VideoOff, SkipForward, Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getDifficultyColor, getRoundTypeLabel, getScoreColor } from "@/lib/utils";
import { useTTS, useSTT } from "@/hooks/use-speech";
import { getPersona } from "@/lib/personas";
import { useCamera } from "@/hooks/use-camera";
import { CodeEditor } from "@/components/interview/code-editor";
import { PANEL_AGENT_META, parsePanelAgent, type PanelAgentId } from "@/lib/panel";

interface Question {
  id: string;
  text: string;
  type: string;
  orderIndex: number;
  source?: "resume" | "general";
  panelAgent?: string | null;
  starterCode?: string | null;
  codeLanguage?: string | null;
}
interface SessionData {
  id: string; title: string; role: string;
  difficulty: string; roundType: string; status: string;
  language: string;
  questions: Question[];
  panelInterview?: boolean;
  pairProgramming?: boolean;
}
interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  source?: "resume" | "general";
  panelAgent?: PanelAgentId;
}

function interviewSignalLabel(signal: string): string {
  const labels: Record<string, string> = {
    follow_up: "Follow-up needed",
    next_level: "Strong — level up",
    proceed: "On track",
    easier: "Gentler cue",
    clarify: "Re-align",
  };
  return labels[signal] ?? signal;
}

function qMessage(q: Question, idSuffix = ""): ChatMessage {
  const pa = parsePanelAgent(q.panelAgent);
  return {
    id: `q-${q.id}${idSuffix}`,
    role: "assistant",
    content: q.text,
    source: q.source,
    ...(pa ? { panelAgent: pa } : {}),
  };
}

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
  const [warmup, setWarmup] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Code editor state
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [codeScores, setCodeScores] = useState<Record<string, number>>({}); // questionId → score

  /** Webcam presence (OpenAI vision — optional) */
  const [videoInsight, setVideoInsight] = useState<{
    eyeContactScore: number;
    bodyLanguageScore: number;
    confidenceSummary: string;
    signals: string[];
    coachingTip: string;
  } | null>(null);
  const [videoInsightLoading, setVideoInsightLoading] = useState(false);
  const [videoInsightNote, setVideoInsightNote] = useState<string | null>(null);

  // Real-time confidence tracking
  const [confidenceHistory, setConfidenceHistory] = useState<Array<{
    questionIdx: number;
    confidenceScore: number;
    qualityScore: number;
    tone: string;
    signal: string;
    aiAction: string;
  }>>([]);
  const [latestConfidence, setLatestConfidence] = useState<{
    confidenceScore: number;
    qualityScore: number;
    tone: string;
    signal: string;
    aiAction: string;
    nextQuestionLevel?: string;
    indicators?: string[];
  } | null>(null);

  // Progressive hint system
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState("");
  const [hintEncouragement, setHintEncouragement] = useState("");
  const [hintLoading, setHintLoading] = useState(false);
  const [totalPenalty, setTotalPenalty] = useState(0);

  const doneRef = useRef(false);
  const listeningRef = useRef(false);
  const speakingRef = useRef(false);
  const submittingRef = useRef(false);

  // Warn user before navigating away mid-interview
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!doneRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Keep latest submit fn accessible inside STT callback
  const submitRef = useRef<((text: string) => void) | null>(null);

  // ── TTS ──────────────────────────────────────────────────────
  const { speak, stop: stopSpeaking, speaking, enabled: ttsEnabled, setEnabled: setTtsEnabled, voiceGender, setVoiceGender, voicesReady } = useTTS("male", session?.language?.split("-")[0] ?? "en");
  const lastSpokenId = useRef("");
  const pendingGreetingRef = useRef<string | null>(null);

  // ── Camera ───────────────────────────────────────────────────
  const { status: camStatus, enabled: camEnabled, toggleCamera, attachVideo, capturePhoto } = useCamera();

  // Speak new AI messages — with retry for greeting (voices may not be ready)
  useEffect(() => {
    if (!ttsEnabled) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (last.id === lastSpokenId.current || last.id === "feedback-error") return;
    lastSpokenId.current = last.id;

    if (last.id === "intro") {
      // Greeting — voices may not be loaded yet, retry with delays
      pendingGreetingRef.current = last.content;
      [800, 2000, 4000].forEach((delay) => {
        setTimeout(() => {
          if (pendingGreetingRef.current) speak(pendingGreetingRef.current);
        }, delay);
      });
    } else {
      const t = setTimeout(() => speak(last.content), 300);
      return () => clearTimeout(t);
    }
  }, [messages, ttsEnabled, speak]);

  // Once voices are ready, speak pending greeting immediately
  useEffect(() => {
    if (voicesReady && ttsEnabled && pendingGreetingRef.current) {
      const content = pendingGreetingRef.current;
      pendingGreetingRef.current = null;
      setTimeout(() => speak(content), 200);
    }
  }, [voicesReady, ttsEnabled, speak]);

  // Clear pending greeting once speaking starts
  useEffect(() => {
    if (speaking) pendingGreetingRef.current = null;
  }, [speaking]);

  // ── STT ──────────────────────────────────────────────────────
  const handleInterim = useCallback((text: string) => setAnswer(text), []);

  // Auto-submit fires when silence detected
  const handleAutoSubmit = useCallback((text: string) => {
    submitRef.current?.(text);
  }, []);

  const sttLang =
    session?.language && session.language.includes("-")
      ? session.language
      : `${session?.language ?? "en"}-US`;

  const { start: startMic, stop: stopMic, listening, supported: micSupported, countdown, canSubmit, cancelAutoSubmit, sttError, clearSttError } = useSTT({
    onInterim: handleInterim,
    onAutoSubmit: handleAutoSubmit,
    silenceMs: 4000,   // 4 seconds — enough time for natural pauses
    minWords: 4,       // must say at least 4 words before auto-submit kicks in
    lang: sttLang,
  });

  listeningRef.current = listening;
  speakingRef.current = speaking;
  submittingRef.current = submitting;

  /** Lightweight live hint while the candidate is speaking or typing (updates as text changes). */
  const liveSpeakingHint = useMemo(() => {
    const t = answer.trim();
    if (!t || warmup || done || t.length < 8) return null;
    let score = 82;
    const lower = t.toLowerCase();
    const fillers = (lower.match(/\b(um|uh|uhh|like|you know|i mean|sort of|kind of)\b/g) ?? []).length;
    const hedges = (lower.match(/\b(maybe|i think|i guess|i don'?t know|not sure|probably|might|could be|perhaps)\b/g) ?? []).length;
    score -= fillers * 7;
    score -= hedges * 5;
    const words = t.split(/\s+/).filter(Boolean).length;
    if (words < 5) score -= 14;
    if (/\.{3,}|…/.test(t)) score -= 8;
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [answer, warmup, done]);

  // ── Core submit logic ────────────────────────────────────────
  const doSubmit = useCallback(async (text: string) => {
    if (!text.trim() || !session) return;
    stopMic();
    stopSpeaking();
    setAnswer("");
    setSubmitting(true);

    setMessages((p) => [...p, { id: `user-${Date.now()}`, role: "user", content: text.trim() }]);

    // ── Warmup phase: candidate replied to greeting → start Q1 ──
    if (warmup) {
      setWarmup(false);
      const q0 = session.questions[0];

      // AI acknowledges candidate's warmup response naturally
      const warmupReplies = [
        "That's great to hear! Let's dive right in.",
        "Wonderful! I'm glad you're ready. Let's get started.",
        "Perfect! I appreciate your enthusiasm. Here we go.",
        "Excellent! Let's make the most of our time together.",
        "Sounds good! I'm looking forward to our conversation.",
      ];

      // Detect sentiment in candidate's warmup reply
      const positiveWords = /good|great|fine|ready|excited|awesome|perfect|well|yes|sure|absolutely|let'?s go/i;
      const nervousWords = /nervous|anxious|scared|worried|bit|little|okay|ok|alright/i;

      let warmupAck = "";
      if (nervousWords.test(text)) {
        warmupAck = "It's completely normal to feel a little nervous — take a deep breath, you've got this! Let's start with the first question.";
      } else if (positiveWords.test(text)) {
        warmupAck = warmupReplies[Math.floor(Math.random() * warmupReplies.length)];
      } else {
        warmupAck = "Great! Let's get started with the interview.";
      }

      setTimeout(() => {
        setMessages((p) => [...p, {
          id: "warmup-bridge", role: "assistant",
          content: warmupAck,
        }]);
        // Wait long enough for TTS to finish the warmup ack before pushing Q1
        // Estimate ~70ms per character for speech, minimum 2.5s, max 5s
        const ackSpeakMs = ttsEnabled
          ? Math.min(5000, Math.max(2500, warmupAck.length * 70))
          : 800;
        setTimeout(() => {
          const panelIntro: ChatMessage[] = session.panelInterview
            ? [
                { id: `panel-i1-${Date.now()}`, role: "assistant", content: "Hi — I'm your Technical AI. I'll ask coding and engineering questions.", panelAgent: "technical" },
                { id: `panel-i2-${Date.now()}`, role: "assistant", content: "Hello — I'm your HR AI. I'll cover motivation and behavioral topics.", panelAgent: "hr" },
                { id: `panel-i3-${Date.now()}`, role: "assistant", content: `Hey — I'm your Domain AI for ${session.role}. Expect deep, role-specific scenarios.`, panelAgent: "domain" },
              ]
            : [];
          setMessages((p) => [...p, ...panelIntro, qMessage(q0)]);
          setCurrentIndex(0);
          setSubmitting(false);
        }, ackSpeakMs);
      }, 400);
      return;
    }

    // ── Normal interview flow ──
    const currentQ = session.questions[currentIndex];

    // ── End intent detection ──
    const endPhrases = /\b(end|finish|stop|quit|done|that'?s? all|i'?m done|wrap up|let'?s end|can we end|want to end|would like to end|please end)\b/i;
    if (endPhrases.test(text.trim())) {
      const goodbye = "Thank you so much for your time today! It was a pleasure speaking with you. Your responses have been recorded — you'll receive your feedback shortly. Best of luck! 🎉";
      setMessages((p) => [...p, { id: "goodbye", role: "assistant", content: goodbye }]);
      setSubmitting(false);
      setDone(true);
      // Wait for AI to finish speaking goodbye before navigating
      // speakingRef tracks real-time speaking state
      if (ttsEnabled) {
        // Poll speaking state — navigate only after AI finishes
        const waitForSpeechEnd = () => {
          const checkInterval = setInterval(() => {
            if (!speakingRef.current) {
              clearInterval(checkInterval);
              // Small buffer after speech ends
              setTimeout(() => handleEndInterview(), 800);
            }
          }, 300);
          // Safety timeout — max 30 seconds wait
          setTimeout(() => {
            clearInterval(checkInterval);
            handleEndInterview();
          }, 30_000);
        };
        // Give TTS 1 second to start speaking, then watch for it to stop
        setTimeout(waitForSpeechEnd, 1000);
      } else {
        setTimeout(() => handleEndInterview(), 1500);
      }
      return;
    }

    // ── Repeat question intent detection ──
    const repeatPhrases = /\b(repeat|say that again|can you repeat|please repeat|again|come again|pardon|didn'?t (hear|catch|get)|what was the question|what'?s the question|one more time|say again)\b/i;
    if (repeatPhrases.test(text.trim()) && text.trim().split(" ").length <= 10) {
      const repeatAck = "Of course! Here's the question again.";
      setMessages((p) => [...p, {
        id: `repeat-ack-${Date.now()}`, role: "assistant",
        content: repeatAck,
      }]);
      // Wait for ack to be spoken, then re-push the current question
      const ackDelay = ttsEnabled ? Math.min(3000, Math.max(1500, repeatAck.length * 70)) : 400;
        setTimeout(() => {
          setMessages((p) => [...p, qMessage(currentQ, `-${Date.now()}`)]);
          setSubmitting(false);
        }, ackDelay);
      return;
    }

    // ── Next question intent detection ──
    const nextPhrases = /\b(next|next question|move on|skip|continue|go ahead|proceed|next one|move forward)\b/i;
    if (nextPhrases.test(text.trim()) && text.trim().split(" ").length <= 5) {
      // Short "next question" command — skip to next without saving answer
      const next = currentIndex + 1;
      if (next < session.questions.length) {
        const nq = session.questions[next];
        setMessages((p) => [...p, {
          id: `skip-ack-${Date.now()}`, role: "assistant",
          content: "Sure! Moving on to the next question.",
        }]);
        setTimeout(() => {
          setMessages((p) => [...p, qMessage(nq)]);
          setCurrentIndex(next);
          setSubmitting(false);
        }, 400);
      } else {
        setDone(true);
        setMessages((p) => [...p, {
          id: "complete", role: "assistant",
          content: "That was the last question! Great job completing the interview. Click 'Get Scorecard' to see your detailed performance report.",
        }]);
        setSubmitting(false);
      }
      return;
    }

    const res = await fetch("/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: currentQ.id, answerText: text.trim(), sessionId: id }),
    });
    const data = await res.json();
    const next = currentIndex + 1;

    // Update real-time confidence
    if (data.confidence) {
      const c = data.confidence;
      setLatestConfidence(c);
      setConfidenceHistory((prev) => [...prev, {
        questionIdx: currentIndex,
        confidenceScore: c.confidenceScore,
        qualityScore: c.qualityScore,
        tone: c.tone,
        signal: c.signal,
        aiAction: c.aiAction ?? "",
      }]);
    }

    const adaptive = data.adaptive as {
      applied?: boolean;
      message?: string;
      newDifficulty?: string;
      updatedQuestions?: Array<{ id: string; text: string; orderIndex: number; type: string }>;
    } | undefined;

    let qs = session.questions;
    if (adaptive?.updatedQuestions?.length) {
      const map = new Map(adaptive.updatedQuestions.map((u) => [u.id, u.text]));
      qs = qs.map((q) => (map.has(q.id) ? { ...q, text: map.get(q.id)! } : q));
    }
    if (data.followupQuestion) {
      qs = [...qs, data.followupQuestion];
    }
    const sessionDifficulty = adaptive?.newDifficulty ?? session.difficulty;
    if (adaptive?.updatedQuestions?.length || data.followupQuestion || adaptive?.newDifficulty) {
      setSession((p) => (p ? { ...p, questions: qs, difficulty: sessionDifficulty } : p));
    }

    if (adaptive?.applied && adaptive.message) {
      const coach = adaptive.message;
      setMessages((p) => [...p, {
        id: `adaptive-${Date.now()}`,
        role: "assistant",
        content: coach,
      }]);
    }

    if (data.followupQuestion) {
      setMessages((p) => [...p, { id: `q-${data.followupQuestion.id}`, role: "assistant", content: data.followupQuestion.text, source: undefined }]);
      setCurrentIndex(next);
    } else if (next < qs.length) {
      const nq = qs[next];
      setMessages((p) => [...p, qMessage(nq)]);
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
  }, [session, currentIndex, id, warmup, stopMic, stopSpeaking, ttsEnabled, micSupported, done, startMic]);

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

        const candidateName: string = d.session.user?.name ?? "";
        const firstName = candidateName.split(" ")[0] ?? "";

        // Warmup greeting — no question yet — persona-aware
        const personaId = d.session.persona ?? "friendly";
        const greetings: Record<string, string> = {
          friendly:      `Hello${firstName ? `, ${firstName}` : ""}! 😊 I'm your AI interviewer today. I'm really looking forward to our conversation! How are you feeling? Ready to begin?`,
          strict:        `Hello${firstName ? `, ${firstName}` : ""}. I'm your interviewer. We'll be covering technical topics in depth today. Are you prepared to begin?`,
          conversational:`Hey${firstName ? ` ${firstName}` : ""}! Great to meet you. Think of this as a casual chat between engineers. How are you doing today?`,
          react_expert:  `Hello${firstName ? `, ${firstName}` : ""}! ⚛️ I'm a React specialist and we'll be going deep on frontend concepts today. How are you feeling?`,
          nodejs_expert: `Hello${firstName ? `, ${firstName}` : ""}! 🟢 I specialize in Node.js and backend systems. Ready to dive into some interesting backend challenges?`,
          devops_expert: `Hello${firstName ? `, ${firstName}` : ""}! 🚀 I'm your DevOps interviewer. We'll cover infrastructure, CI/CD, and cloud topics. Are you ready?`,
          google_style:  `Welcome${firstName ? `, ${firstName}` : ""}. 🔍 This will be a Google-style interview covering algorithms and system design. Think out loud — I want to understand your reasoning. Ready?`,
          startup_style: `Hey${firstName ? ` ${firstName}` : ""}! ⚡ We move fast here. I care about what you've actually built. How are you doing today?`,
          amazon_style:  `Hello${firstName ? `, ${firstName}` : ""}. 📦 We'll be using Amazon's Leadership Principles format today — STAR method for behavioral questions. Ready to get started?`,
        };
        const greeting = greetings[personaId] ?? greetings.friendly;
        const introText = d.session.panelInterview
          ? `${greeting}\n\nYou'll see three AI interviewers in this chat — Technical, HR, and Domain — taking turns.`
          : greeting;
        const msgs: ChatMessage[] = [{
          id: "intro", role: "assistant",
          content: introText,
        }];

        const qs = d.session.questions as Array<Question & { answers: Array<{ text: string }> }>;
        let lastAnswered = -1;
        qs.forEach((q, i) => {
          if (q.answers?.length > 0) {
            msgs.push(qMessage(q));
            msgs.push({ id: `a-${q.id}`, role: "user", content: q.answers[0].text });
            lastAnswered = i;
          }
        });

        if (lastAnswered >= 0) {
          // Resuming session — skip warmup, show next question directly
          setWarmup(false);
          const next = lastAnswered + 1;
          if (next < s.questions.length) {
            msgs.push(qMessage(s.questions[next]));
            setCurrentIndex(next);
          } else {
            setDone(true);
          }
        }
        // New session — warmup=true, no question pushed yet

        setMessages(msgs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Periodically analyze webcam frame for on-camera presence (needs OPENAI_API_KEY)
  useEffect(() => {
    if (!camEnabled || done || loading || warmup) return;
    const tick = async () => {
      const dataUrl = capturePhoto();
      if (!dataUrl) return;
      setVideoInsightLoading(true);
      try {
        const res = await fetch("/api/interview/video-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl, sessionId: id }),
        });
        const data = await res.json();
        if (data.skipped) {
          setVideoInsightNote(data.message ?? null);
          return;
        }
        if (data.analysis) {
          setVideoInsight(data.analysis);
          setVideoInsightNote(null);
        }
      } catch {
        /* noop */
      } finally {
        setVideoInsightLoading(false);
      }
    };
    const sooner = window.setTimeout(tick, 9000);
    const interval = window.setInterval(tick, 26000);
    return () => {
      clearTimeout(sooner);
      clearInterval(interval);
    };
  }, [camEnabled, done, loading, warmup, capturePhoto, id]);

  // Auto-start mic when session loads (if TTS is on, wait for first speak; if off, start immediately)
  useEffect(() => {
    if (!loading && !done && micSupported && !warmup) {
      const t = setTimeout(() => { if (!listening) startMic(); }, 800);
      return () => clearTimeout(t);
    }
  }, [loading, done, micSupported, warmup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warmup + AI voice off: start mic without waiting for TTS (none is playing)
  useEffect(() => {
    if (loading || done || !micSupported || !warmup || ttsEnabled) return;
    const t = setTimeout(() => startMic(), 600);
    return () => clearTimeout(t);
  }, [loading, done, micSupported, warmup, ttsEnabled, startMic]);

  // Safety net: if TTS never drives "speaking" (browser blocked, etc.), still open the mic
  useEffect(() => {
    if (loading || done || !micSupported) return;
    const id = window.setTimeout(() => {
      if (!listeningRef.current && !speakingRef.current && !submittingRef.current) startMic();
    }, 14000);
    return () => clearTimeout(id);
  }, [loading, done, micSupported, startMic]);

  // Keep ref in sync
  useEffect(() => { submitRef.current = doSubmit; }, [doSubmit]);

  // ── Skip question ────────────────────────────────────────────
  const handleSkip = useCallback(async () => {
    if (!session || warmup || done || submitting) return;
    stopMic(); stopSpeaking();
    setSubmitting(true);
    const currentQ = session.questions[currentIndex];
    // Save a placeholder answer so feedback knows it was skipped
    await fetch("/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: currentQ.id, answerText: "[Skipped]", sessionId: id }),
    });
    const next = currentIndex + 1;
    if (next < session.questions.length) {
      setMessages((p) => [...p,
        { id: `skip-${currentQ.id}`, role: "user", content: "⏭ Skipped" },
        qMessage(session.questions[next]),
      ]);
      setCurrentIndex(next);
    } else {
      setMessages((p) => [...p,
        { id: `skip-${currentQ.id}`, role: "user", content: "⏭ Skipped" },
        { id: "complete", role: "assistant", content: "Great job! You've answered all the questions. Click 'Get Scorecard' to see your detailed performance report." },
      ]);
      setDone(true);
    }
    setSubmitting(false);
  }, [session, currentIndex, id, warmup, done, submitting, stopMic, stopSpeaking]);

  // ── Request Hint ─────────────────────────────────────────────
  async function requestHint() {
    if (!session || warmup || done || hintLevel >= 3) return;
    setHintLoading(true);
    const currentQ = session.questions[currentIndex];
    const nextLevel = hintLevel + 1;

    const res = await fetch("/api/interview/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionText: currentQ.text,
        hintLevel: nextLevel,
        questionId: currentQ.id,
        sessionId: id,
      }),
    });
    const data = await res.json();
    setHintLoading(false);

    if (res.ok) {
      setHintLevel(nextLevel);
      setHintText(data.hint);
      setHintEncouragement(data.encouragement ?? "");
      setTotalPenalty((p) => p + (data.scorePenalty ?? 0));
      // Show hint as AI message
      setMessages((p) => [...p, {
        id: `hint-${nextLevel}-${Date.now()}`,
        role: "assistant",
        content: `💡 Hint ${nextLevel}/3: ${data.hint}\n\n${data.encouragement}`,
      }]);
    }
  }

  // Reset hint when moving to next question
  useEffect(() => {
    setHintLevel(0);
    setHintText("");
    setHintEncouragement("");
  }, [currentIndex]);

  // ── End interview ────────────────────────────────────────────
  async function handleEndInterview() {
    stopMic();
    // NOTE: Do NOT call stopSpeaking() here — goodbye message may still be playing
    // Speaking will stop naturally, or was already stopped before calling this
    setFinishing(true);
    doneRef.current = true;

    // Mark session complete
    await fetch("/api/interview/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    });

    // Try to generate feedback — if no answers, just go to history
    const res = await fetch("/api/feedback/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id, hintPenalty: totalPenalty }),
    });

    if (res.ok) {
      router.push(`/feedback/${id}`);
    } else {
      // No answers or error — go to history instead
      router.push("/history");
    }
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

      {/* Code Editor Modal */}
      {showCodeEditor && session && !warmup && (
        <CodeEditor
          question={session.questions[currentIndex]?.text ?? ""}
          questionId={session.questions[currentIndex]?.id ?? ""}
          sessionId={id}
          initialCode={session.questions[currentIndex]?.starterCode ?? undefined}
          initialLanguage={session.questions[currentIndex]?.codeLanguage ?? undefined}
          onClose={() => setShowCodeEditor(false)}
          onSubmit={(code, review) => {
            // Save code score
            const qId = session.questions[currentIndex]?.id;
            if (qId) setCodeScores((p) => ({ ...p, [qId]: review.score }));

            // Submit code as answer text
            const answerText = `[Code Submission — ${review.verdict.toUpperCase()} — Score: ${review.score}/100]\n\n\`\`\`\n${code}\n\`\`\`\n\nAI Review: ${review.summary}`;
            setShowCodeEditor(false);
            doSubmit(answerText);
          }}
        />
      )}

      {/* ── Header ── */}
      <div className="shrink-0 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-bold text-lg truncate">{session.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className={getDifficultyColor(session.difficulty)}>{session.difficulty}</Badge>
              <Badge variant="outline">{getRoundTypeLabel(session.roundType)}</Badge>
              {session.panelInterview && (
                <Badge variant="outline" className="border-blue-500/40 text-blue-300">3-AI panel</Badge>
              )}
              {session.pairProgramming && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300">Pair programming</Badge>
              )}
              <span className="text-xs text-muted-foreground">{answered}/{totalQ} answered</span>
              {totalPenalty > 0 && (
                <span className="text-xs text-yellow-400 flex items-center gap-0.5">
                  💡 −{totalPenalty} pts
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* TTS toggle */}
            <button
              type="button"
              title="Plays the interviewer’s questions aloud. Your microphone is the mic button below."
              onClick={() => { if (ttsEnabled) stopSpeaking(); setTtsEnabled(!ttsEnabled); }}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all ${
                ttsEnabled ? "border-violet-500 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {speaking ? <AudioLines className="h-3.5 w-3.5 animate-pulse" /> : ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{speaking ? "Speaking…" : ttsEnabled ? "Voice On" : "Voice Off"}</span>
            </button>

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

            {/* Camera toggle */}
            <button
              onClick={toggleCamera}
              title={camEnabled ? "Turn off camera" : "Turn on camera"}
              disabled={camStatus === "denied"}
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

        {/* ── Real-time Confidence Indicator ── */}
        {latestConfidence && !warmup && (
          <div className={`mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-xs border transition-all ${
            latestConfidence.tone === "confident" || latestConfidence.tone === "strong"
              ? "bg-green-500/10 border-green-500/20 text-green-400"
              : latestConfidence.tone === "hesitant" || latestConfidence.tone === "nervous"
              ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            {/* Tone emoji */}
            <span className="text-base shrink-0">
              {latestConfidence.tone === "confident" ? "💪"
                : latestConfidence.tone === "strong" ? "🔥"
                : latestConfidence.tone === "hesitant" ? "🤔"
                : latestConfidence.tone === "nervous" ? "😰"
                : "😕"}
            </span>

            {/* Scores */}
            <div className="flex items-center gap-3 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Confidence:</span>
                <span className="font-bold">{latestConfidence.confidenceScore}/100</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Quality:</span>
                <span className="font-bold">{latestConfidence.qualityScore}/100</span>
              </div>
              <span className="capitalize font-medium">{latestConfidence.tone}</span>
            </div>

            {/* AI action hint */}
            {latestConfidence.aiAction && (
              <span className="text-muted-foreground italic hidden sm:block max-w-xs truncate">
                {latestConfidence.aiAction}
              </span>
            )}
          </div>
        )}

        {!warmup && (
          <div className="mt-3 rounded-xl border border-border bg-card/60 px-3 py-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground">Answer analysis</span>
              <div className="flex items-center gap-2">
                {listening && (
                  <span className="text-[10px] font-medium text-amber-400 flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
            </div>

            {submitting && (
              <p className="text-xs text-muted-foreground animate-pulse">Analyzing confidence and tone…</p>
            )}

            {liveSpeakingHint !== null && !submitting && (
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Speaking / typing hint</span>
                  <span>{liveSpeakingHint}%</span>
                </div>
                <Progress value={liveSpeakingHint} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">Updates as you talk — final scores appear after you submit.</p>
              </div>
            )}

            {latestConfidence && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Confidence</span>
                      <span className={getScoreColor(latestConfidence.confidenceScore)}>{latestConfidence.confidenceScore}%</span>
                    </div>
                    <Progress value={latestConfidence.confidenceScore} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Answer quality</span>
                      <span className={getScoreColor(latestConfidence.qualityScore)}>{latestConfidence.qualityScore}%</span>
                    </div>
                    <Progress value={latestConfidence.qualityScore} className="h-1.5" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <Badge variant="outline" className="text-[10px] capitalize">Tone: {latestConfidence.tone}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{interviewSignalLabel(latestConfidence.signal)}</Badge>
                  {latestConfidence.nextQuestionLevel && latestConfidence.nextQuestionLevel !== "same" && (
                    <Badge variant="outline" className="text-[10px] capitalize">
                      Next: {latestConfidence.nextQuestionLevel}
                    </Badge>
                  )}
                </div>
                {latestConfidence.indicators && latestConfidence.indicators.length > 0 && (
                  <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-0.5">
                    {latestConfidence.indicators.slice(0, 4).map((ind, i) => (
                      <li key={i}>{ind}</li>
                    ))}
                  </ul>
                )}
                {latestConfidence.aiAction ? (
                  <p className="text-xs text-muted-foreground leading-snug border-l-2 border-violet-500/40 pl-2.5">
                    {latestConfidence.aiAction}
                  </p>
                ) : null}
              </>
            )}

            {!latestConfidence && !liveSpeakingHint && !submitting && (
              <p className="text-xs text-muted-foreground">Submit an answer to see AI confidence scores and coaching notes.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Floating Camera Preview ── */}
      {camEnabled && (
        <div className="fixed bottom-24 right-4 z-50 group">
          <div
            className="relative rounded-2xl overflow-hidden border-2 border-green-500/50 shadow-2xl shadow-black/40 bg-black"
            style={{ width: 200, height: 150 }}
          >
            <video
              ref={attachVideo}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* Live indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-white font-medium">LIVE</span>
            </div>
            {/* Close on hover */}
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

      {/* Camera permission denied */}
      {camStatus === "denied" && (
        <div className="mx-0 mb-2 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          <VideoOff className="h-3.5 w-3.5 shrink-0" />
          Camera access blocked. Allow camera in browser settings and refresh.
        </div>
      )}

      {camEnabled && (videoInsight || videoInsightNote || videoInsightLoading) && (
        <div className="mx-0 mb-2 rounded-lg border border-green-500/25 bg-green-500/5 px-3 py-2 text-xs space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-green-300">Video presence (snapshot)</span>
            {videoInsightLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-green-400" />}
          </div>
          {videoInsightNote && <p className="text-muted-foreground">{videoInsightNote}</p>}
          {videoInsight && (
            <>
              <div className="flex flex-wrap gap-3 text-[11px]">
                <span>Eye contact est. <strong>{videoInsight.eyeContactScore}</strong>/100</span>
                <span>Body language <strong>{videoInsight.bodyLanguageScore}</strong>/100</span>
              </div>
              <p className="text-zinc-300 leading-snug">{videoInsight.confidenceSummary}</p>
              {videoInsight.signals?.length > 0 && (
                <ul className="list-disc list-inside text-muted-foreground">
                  {videoInsight.signals.slice(0, 4).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              {videoInsight.coachingTip && (
                <p className="text-amber-200/90 border-l-2 border-amber-500/40 pl-2">{videoInsight.coachingTip}</p>
              )}
            </>
          )}
        </div>
      )}

      {sttError && (
        <div className="mx-0 mb-2 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
          <Mic className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{sttError}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Tip: “Voice On” only controls the AI reading questions. Voice answers use the mic button and need Chrome or Edge on desktop for best results.
            </p>
          </div>
          <button type="button" onClick={clearSttError} className="text-muted-foreground hover:text-foreground shrink-0">×</button>
        </div>
      )}

      {/* ── Chat ── */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
        {messages.map((msg) => {
          const panel = msg.panelAgent;
          const meta = panel ? PANEL_AGENT_META[panel] : null;
          return (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              msg.role === "assistant" ? (meta?.botClass ?? "bg-violet-600") : "bg-secondary"
            }`}>
              {msg.role === "assistant" ? <Bot className="h-4 w-4 text-white" /> : <User className="h-4 w-4" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "assistant" ? "bg-card border border-border rounded-tl-sm" : "bg-violet-600 text-white rounded-tr-sm"
            }`}>
              {msg.role === "assistant" && meta && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-2 mr-1 border ${meta.badgeClass}`}>
                  {meta.emoji} {meta.label}
                </span>
              )}
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
          );
        })}

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
                    type="button"
                    title="Speak your answer (browser speech recognition)"
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
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSubmit(answer); } }}
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
                <kbd className="px-1 py-0.5 rounded bg-secondary text-xs">Enter</kbd> to submit · <kbd className="px-1 py-0.5 rounded bg-secondary text-xs">Shift+Enter</kbd> for newline
              </p>
              <div className="flex items-center gap-2">
                {/* Code Editor button — show for technical/coding questions */}
                {!warmup &&
                  (session?.roundType === "technical" ||
                    session?.pairProgramming ||
                    Boolean(session?.questions[currentIndex]?.starterCode)) && (
                  <button
                    onClick={() => setShowCodeEditor(true)}
                    disabled={submitting}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-violet-400 transition-colors border border-border hover:border-violet-400/50 rounded-lg px-2 py-1"
                    title="Open code editor for this question"
                  >
                    <Code2 className="h-3 w-3" /> Code
                  </button>
                )}
                {/* Hint button */}
                {!warmup && !done && (
                  <button
                    onClick={requestHint}
                    disabled={submitting || hintLoading || hintLevel >= 3}
                    title={hintLevel >= 3 ? "No more hints available" : `Get hint ${hintLevel + 1}/3 (−${(hintLevel + 1) * 5} pts)`}
                    className={`flex items-center gap-1 text-xs transition-colors border rounded-lg px-2 py-1 ${
                      hintLevel >= 3
                        ? "border-border text-muted-foreground/40 cursor-not-allowed"
                        : hintLevel > 0
                        ? "border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                        : "border-border text-muted-foreground hover:text-yellow-400 hover:border-yellow-400/50"
                    }`}
                  >
                    {hintLoading
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <span>💡</span>}
                    {hintLevel === 0 ? "Hint" : hintLevel >= 3 ? "No more hints" : `Hint ${hintLevel + 1}/3`}
                    {hintLevel > 0 && hintLevel < 3 && (
                      <span className="text-[10px] text-yellow-500/70">−{(hintLevel + 1) * 5}pts</span>
                    )}
                  </button>
                )}
                {/* Skip button */}
                {!warmup && (
                  <button onClick={handleSkip} disabled={submitting}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-yellow-400 transition-colors border border-border hover:border-yellow-400/50 rounded-lg px-2 py-1">
                    <SkipForward className="h-3 w-3" /> Skip
                  </button>
                )}
                {listening && (
                  <div className="flex items-center gap-2">
                    {canSubmit && countdown > 0 ? (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-orange-400 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
                          Sending in {countdown}s…
                        </p>
                        <button onClick={cancelAutoSubmit}
                          className="text-xs px-2 py-0.5 rounded-md border border-orange-400/50 text-orange-400 hover:bg-orange-400/10 transition-all font-medium">
                          Wait, I&apos;m not done
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-red-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
                        {!canSubmit ? "Keep speaking… (need a few more words)" : "Recording…"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-4">
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-400">Interview complete!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {speaking ? "AI is speaking... please wait" : "Your AI scorecard is ready"}
              </p>
            </div>
            <Button
              onClick={() => {
                // If AI is still speaking, wait for it to finish
                if (speaking && ttsEnabled) {
                  const check = setInterval(() => {
                    if (!speakingRef.current) {
                      clearInterval(check);
                      setTimeout(() => handleEndInterview(), 500);
                    }
                  }, 300);
                  setTimeout(() => { clearInterval(check); handleEndInterview(); }, 20_000);
                } else {
                  handleEndInterview();
                }
              }}
              disabled={finishing}
              className="shrink-0"
            >
              {finishing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : speaking
                ? <AudioLines className="h-4 w-4 animate-pulse" />
                : <Flag className="h-4 w-4" />}
              {finishing ? "Loading..." : speaking ? "Wait..." : "Get Scorecard"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
