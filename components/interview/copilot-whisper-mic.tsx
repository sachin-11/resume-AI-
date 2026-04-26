"use client";

import { useEffect, useRef } from "react";

const CHUNK_MS = 5000;

type Props = {
  active: boolean;
  apiLang: string;
  onTextChunk: (text: string) => void;
  onBusy: (b: boolean) => void;
  onError: (e: string | null) => void;
};

function pickMediaRecorderMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mime: "audio/webm", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return { mime: "audio/webm;codecs=opus", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return { mime: "audio/webm", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return { mime: "audio/mp4", ext: "m4a" };
  }
  return { mime: "audio/webm", ext: "webm" };
}

/**
 * Groq Whisper needs a *complete* media file. MediaRecorder `timeslice` events are
 * not standalone WebM/MP4 — we record one short segment, then stop, merge `dataavailable` chunks into one Blob.
 */
export function CopilotWhisperMic({ active, apiLang, onTextChunk, onBusy, onError }: Props) {
  const onTextChunkRef = useRef(onTextChunk);
  const onBusyRef = useRef(onBusy);
  const onErrorRef = useRef(onError);
  onTextChunkRef.current = onTextChunk;
  onBusyRef.current = onBusy;
  onErrorRef.current = onError;

  const streamRef = useRef<MediaStream | null>(null);
  const currentRecRef = useRef<MediaRecorder | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goneRef = useRef(false);

  useEffect(() => {
    if (!active) {
      goneRef.current = true;
      if (segmentTimerRef.current) {
        clearTimeout(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }
      try {
        if (currentRecRef.current?.state === "recording") {
          currentRecRef.current.requestData();
          currentRecRef.current.stop();
        }
      } catch {
        /* noop */
      }
      currentRecRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    goneRef.current = false;
    const { mime, ext } = pickMediaRecorderMime();

    (async function run() {
      onErrorRef.current(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          onErrorRef.current("Microphone not available in this browser.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (goneRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const uploadBlob = async (blob: Blob) => {
          if (blob.size < 2000) return;
          onBusyRef.current(true);
          try {
            const fd = new FormData();
            const filename = `mic.${ext}`;
            fd.append("audio", blob, filename);
            fd.append("lang", apiLang);
            const res = await fetch("/api/interview/copilot/transcribe", { method: "POST", body: fd });
            const data = await res.json();
            if (!res.ok) {
              onErrorRef.current(data.error ?? "Whisper failed");
              return;
            }
            onErrorRef.current(null);
            const t = typeof data.text === "string" ? data.text.trim() : "";
            if (t) onTextChunkRef.current(t);
          } catch {
            onErrorRef.current("Network / transcript error");
          } finally {
            onBusyRef.current(false);
          }
        };

        // One *complete* file per ~CHUNK_MS: new MediaRecorder, start(), stop() after CHUNK_MS, merge all parts.
        while (!goneRef.current) {
          const chunks: Blob[] = [];
          const rec = new MediaRecorder(stream, { mimeType: mime });
          currentRecRef.current = rec;

          const segBlob: Blob = await new Promise((resolve) => {
            rec.ondataavailable = (e) => {
              if (e.data?.size) chunks.push(e.data);
            };
            rec.onerror = () => {
              currentRecRef.current = null;
              resolve(new Blob());
            };
            rec.onstop = () => {
              currentRecRef.current = null;
              const b = new Blob(chunks, { type: mime });
              resolve(b);
            };
            rec.start();
            segmentTimerRef.current = setTimeout(() => {
              try {
                if (rec.state === "recording") {
                  rec.requestData();
                  rec.stop();
                }
              } catch {
                try {
                  rec.stop();
                } catch {
                  /* noop */
                }
              }
            }, CHUNK_MS);
          });

          if (segmentTimerRef.current) {
            clearTimeout(segmentTimerRef.current);
            segmentTimerRef.current = null;
          }

          if (goneRef.current) break;
          if (segBlob.size >= 2000) {
            await uploadBlob(segBlob);
          }
        }
      } catch (e) {
        onErrorRef.current(e instanceof Error ? e.message : "Mic permission denied");
      }
    })();

    return () => {
      goneRef.current = true;
      if (segmentTimerRef.current) {
        clearTimeout(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }
      try {
        if (currentRecRef.current?.state === "recording") {
          currentRecRef.current.requestData();
          currentRecRef.current.stop();
        }
      } catch {
        /* noop */
      }
      currentRecRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, apiLang]);

  return null;
}
