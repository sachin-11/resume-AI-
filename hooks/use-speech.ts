"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ── Text-to-Speech ──────────────────────────────────────────────
export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith("en") &&
          (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Natural"))
      );
      if (preferred) utterance.voice = preferred;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [enabled]
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, []);

  useEffect(() => () => stop(), [stop]);
  return { speak, stop, speaking, enabled, setEnabled };
}

// ── Speech-to-Text ──────────────────────────────────────────────
interface STTOptions {
  onInterim: (text: string) => void;
  onAutoSubmit: (text: string) => void;
  silenceMs?: number;       // silence before submit (default 4000ms)
  minWords?: number;        // minimum words required before auto-submit (default 4)
}

export function useSTT({
  onInterim,
  onAutoSubmit,
  silenceMs = 4000,
  minWords = 4,
}: STTOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [countdown, setCountdown] = useState(0);   // seconds remaining
  const [canSubmit, setCanSubmit] = useState(false); // enough words spoken?

  const recRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef("");
  const autoSubmitRef = useRef(onAutoSubmit);

  useEffect(() => { autoSubmitRef.current = onAutoSubmit; }, [onAutoSubmit]);

  useEffect(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    setSupported(!!SR);
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
    const SR =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;

    accumulatedRef.current = "";
    setCanSubmit(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new (SR as any)();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => setListening(true);
    rec.onerror = () => { clearTimers(); setListening(false); };
    rec.onend = () => { clearTimers(); setListening(false); };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
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
