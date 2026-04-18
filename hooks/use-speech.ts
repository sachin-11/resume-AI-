"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ── Text-to-Speech ──────────────────────────────────────────────
export type VoiceGender = "male" | "female";

// Female voice keywords (browser voices)
const FEMALE_KEYWORDS = ["female", "woman", "girl", "zira", "samantha", "victoria",
  "karen", "moira", "tessa", "fiona", "veena", "susan", "kate", "lisa",
  "google uk english female", "google us english"];

// Male voice keywords
const MALE_KEYWORDS = ["male", "man", "guy", "david", "mark", "daniel", "alex",
  "fred", "jorge", "diego", "google uk english male"];

function pickVoice(gender: VoiceGender, lang = "en"): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const allVoices = window.speechSynthesis.getVoices();
  if (allVoices.length === 0) return null;

  const langPrefix = lang.split("-")[0]; // "hi" from "hi-IN", "en" from "en-US"

  // Filter voices matching the language
  const langVoices = allVoices.filter((v) => v.lang.startsWith(langPrefix));
  const pool = langVoices.length > 0 ? langVoices : allVoices.filter((v) => v.lang.startsWith("en"));

  const keywords = gender === "female" ? FEMALE_KEYWORDS : MALE_KEYWORDS;
  const matched = pool.find((v) =>
    keywords.some((kw) => v.name.toLowerCase().includes(kw))
  );
  return matched ?? pool[0] ?? null;
}

export function useTTS(initialGender: VoiceGender = "male", lang = "en") {
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>(initialGender);
  const [voicesReady, setVoicesReady] = useState(false);

  // Voices load asynchronously — wait for them
  useEffect(() => {
    if (typeof window === "undefined") return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) { setVoicesReady(true); return; }
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
      setVoicesReady(true);
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.volume = 1;

      const voice = pickVoice(voiceGender, lang);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.pitch = voiceGender === "female" ? 1.2 : 0.85;
      } else {
        utterance.lang = lang.includes("-") ? lang : "en-US";
        utterance.pitch = voiceGender === "female" ? 1.2 : 0.85;
      }

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [enabled, voiceGender, lang, voicesReady] // added lang + voicesReady
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, []);

  useEffect(() => () => stop(), [stop]);
  return { speak, stop, speaking, enabled, setEnabled, voiceGender, setVoiceGender };
}

// ── Speech-to-Text ──────────────────────────────────────────────
// Web Speech API recognition — not in default `lib.dom` typings in all setups
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionResultEvent {
  results: {
    length: number;
    [i: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window &
    Partial<{ SpeechRecognition: SpeechRecognitionCtor; webkitSpeechRecognition: SpeechRecognitionCtor }>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

interface STTOptions {
  onInterim: (text: string) => void;
  onAutoSubmit: (text: string) => void;
  silenceMs?: number;
  minWords?: number;
  lang?: string;        // BCP-47 language code e.g. "hi-IN", "es-ES"
}

/** User-visible hint when recognition fails (e.g. mic blocked). */
function sttErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow the mic for this site in your browser address bar, then click the mic button again.";
    case "audio-capture":
      return "No microphone was found or it is in use by another app.";
    case "network":
      return "Speech recognition needs a network connection. Check your internet and try again.";
    case "language-not-supported":
      return "This browser does not support speech recognition for the selected language.";
    case "no-speech":
      return "No speech detected. Speak closer to the mic or try again.";
    default:
      return "Voice input stopped unexpectedly. Click the mic to try again.";
  }
}

/** getUserMedia throws DOMException — map to advice; `null` means we can still try Web Speech API. */
function getUserMediaHardStop(err: unknown): string | null {
  if (!(err instanceof DOMException)) return null;
  switch (err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return sttErrorMessage("not-allowed");
    case "SecurityError":
      return "This page is not treated as secure, so the microphone cannot open. Use https:// in production; for local testing use http://localhost (avoid LAN IP URLs if the browser blocks the mic).";
    case "NotFoundError":
      return sttErrorMessage("audio-capture");
    default:
      return null;
  }
}

export function useSTT({
  onInterim,
  onAutoSubmit,
  silenceMs = 4000,
  minWords = 4,
  lang = "en-US",
}: STTOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [countdown, setCountdown] = useState(0);   // seconds remaining
  const [canSubmit, setCanSubmit] = useState(false); // enough words spoken?
  const [sttError, setSttError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef("");
  const autoSubmitRef = useRef(onAutoSubmit);

  useEffect(() => { autoSubmitRef.current = onAutoSubmit; }, [onAutoSubmit]);

  useEffect(() => {
    setSupported(!!getSpeechRecognitionCtor());
  }, []);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(0);
  }, []);

  // Cancel the pending auto-submit (user paused mid-sentence)
  const cancelAutoSubmit = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  const startSilenceTimer = useCallback((text: string) => {
    clearTimers();

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const hasEnough = wordCount >= minWords;
    setCanSubmit(hasEnough);

    // Don't start countdown if not enough words yet
    if (!hasEnough) return;

    const secs = Math.ceil(silenceMs / 1000);
    setCountdown(secs);

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    silenceTimerRef.current = setTimeout(() => {
      clearTimers();
      recRef.current?.stop();
      const final = accumulatedRef.current.trim();
      if (final) autoSubmitRef.current(final);
    }, silenceMs);
  }, [silenceMs, minWords, clearTimers]);

  const clearSttError = useCallback(() => setSttError(null), []);

  const start = useCallback(async () => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) return;

    setSttError(null);
    recRef.current?.stop();
    recRef.current = null;

    if (typeof window !== "undefined" && !window.isSecureContext) {
      const msg = getUserMediaHardStop(new DOMException("Insecure context", "SecurityError"));
      if (msg) setSttError(msg);
      return;
    }

    // Best-effort mic prime (clearer errors + permission prompt). Do not treat every failure as “blocked”.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        const hard = getUserMediaHardStop(e);
        if (hard) {
          setSttError(hard);
          return;
        }
        // NotReadableError, AbortError, etc. — still try speech recognition (often works; toggles can lie).
      }
    }

    accumulatedRef.current = "";
    setCanSubmit(false);

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onstart = () => setListening(true);
    rec.onerror = (ev: Event) => {
      clearTimers();
      setListening(false);
      const err = "error" in ev && typeof (ev as { error?: string }).error === "string"
        ? (ev as { error: string }).error
        : "unknown";
      if (err !== "aborted" && err !== "no-speech") {
        setSttError(sttErrorMessage(err));
      }
    };
    rec.onend = () => { clearTimers(); setListening(false); };

    rec.onresult = (e: SpeechRecognitionResultEvent) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " ";
        else interim += t;
      }
      accumulatedRef.current = final;
      const preview = (final + interim).trim();
      onInterim(preview);

      // Reset silence timer on every speech event
      if (preview) startSilenceTimer(final || preview);
      else clearTimers(); // no speech yet, clear any pending timer
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setSttError(sttErrorMessage("unknown"));
      setListening(false);
    }
  }, [lang, onInterim, startSilenceTimer, clearTimers]);

  const stop = useCallback(() => {
    clearTimers();
    recRef.current?.stop();
    setListening(false);
    setCanSubmit(false);
  }, [clearTimers]);

  useEffect(() => () => { recRef.current?.stop(); clearTimers(); }, [clearTimers]);

  return { start, stop, listening, supported, countdown, canSubmit, cancelAutoSubmit, sttError, clearSttError };
}
