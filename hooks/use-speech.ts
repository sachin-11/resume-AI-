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

function pickVoice(gender: VoiceGender): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  if (voices.length === 0) return null;

  const keywords = gender === "female" ? FEMALE_KEYWORDS : MALE_KEYWORDS;

  // Try keyword match first
  const matched = voices.find((v) =>
    keywords.some((kw) => v.name.toLowerCase().includes(kw))
  );
  if (matched) return matched;

  // Fallback: pitch-based guess — female voices tend to have higher pitch names
  // Just return first English voice as last resort
  return voices[0];
}

export function useTTS(initialGender: VoiceGender = "male") {
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>(initialGender);

  // Voices load asynchronously in some browsers
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.getVoices(); // trigger load
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.volume = 1;

      const voice = pickVoice(voiceGender);
      if (voice) {
        utterance.voice = voice;
        // Adjust pitch to reinforce gender feel
        utterance.pitch = voiceGender === "female" ? 1.2 : 0.85;
      } else {
        utterance.pitch = voiceGender === "female" ? 1.2 : 0.85;
      }

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [enabled, voiceGender]
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
  onerror: (() => void) | null;
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

  const start = useCallback(() => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) return;

    accumulatedRef.current = "";
    setCanSubmit(false);

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onstart = () => setListening(true);
    rec.onerror = () => { clearTimers(); setListening(false); };
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
    rec.start();
  }, [onInterim, startSilenceTimer, clearTimers]);

  const stop = useCallback(() => {
    clearTimers();
    recRef.current?.stop();
    setListening(false);
    setCanSubmit(false);
  }, [clearTimers]);

  useEffect(() => () => { recRef.current?.stop(); clearTimers(); }, [clearTimers]);

  return { start, stop, listening, supported, countdown, canSubmit, cancelAutoSubmit };
}
