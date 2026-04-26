"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, MonitorPlay, StopCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onTranscript: (text: string) => void;
  /** Fires when tab capture starts/stops — use to pause phone mic (same room = double input) */
  onCaptureStateChange?: (active: boolean) => void;
  disabled?: boolean;
};

/**
 * Desktop Chrome/Edge: capture audio from a shared *browser tab* (Zoom/Meet in browser) via getDisplayMedia.
 * Does not work for native installed Zoom app — only when the call runs inside a tab.
 */
export function CopilotTabAudio({ onTranscript, onCaptureStateChange, disabled }: Props) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const runLoopRef = useRef(true);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAll = useCallback(() => {
    runLoopRef.current = false;
    if (segmentTimerRef.current) {
      clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.requestData();
        recorderRef.current.stop();
      }
    } catch {
      /* noop */
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onCaptureStateChange?.(false);
    setActive(false);
  }, [onCaptureStateChange]);

  const sendBlob = useCallback(
    async (blob: Blob, filename: string) => {
      if (blob.size < 2000) return;
      setBusy(true);
      setHint(null);
      try {
        const fd = new FormData();
        fd.append("audio", blob, filename);
        fd.append("lang", "en");
        const res = await fetch("/api/interview/copilot/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setHint(data.error ?? "Transcribe failed");
          return;
        }
        if (data.text?.trim()) {
          onTranscript(String(data.text).trim());
        }
      } catch {
        setHint("Network error");
      } finally {
        setBusy(false);
      }
    },
    [onTranscript]
  );

  const start = useCallback(async () => {
    if (disabled) return;
    setHint(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setHint("Tab sharing is not supported in this browser. Use Chrome or Edge on a computer.");
      return;
    }
    let stream: MediaStream;
    try {
      // Chrome: pick the meeting *tab* and tick "Share tab audio" if the dialog shows it
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
    } catch (e) {
      if ((e as Error).name === "NotAllowedError") {
        setHint("Sharing was cancelled. Pick your meeting tab and allow audio if shown.");
        return;
      }
      setHint("Could not start tab capture. Try Chrome on desktop.");
      return;
    }

    // Do NOT stop video tracks — in Chrome that often ends the whole capture. Record audio only.
    const aOnly = new MediaStream(stream.getAudioTracks());
    if (aOnly.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      setHint("No audio in this share. Try again and enable “Share tab audio” for that tab.");
      return;
    }

    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : "webm";

    runLoopRef.current = true;
    setActive(true);
    onCaptureStateChange?.(true);

    const SEG = 8000;
    (async function segmentLoop() {
      while (runLoopRef.current && aOnly.getAudioTracks().some((t) => t.readyState === "live")) {
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(aOnly, { mimeType: mime });
        recorderRef.current = rec;
        const blob: Blob = await new Promise((resolve) => {
          rec.ondataavailable = (e) => {
            if (e.data?.size) chunks.push(e.data);
          };
          rec.onerror = () => resolve(new Blob());
          rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
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
          }, SEG);
        });
        if (segmentTimerRef.current) {
          clearTimeout(segmentTimerRef.current);
          segmentTimerRef.current = null;
        }
        recorderRef.current = null;
        if (!runLoopRef.current) break;
        if (blob.size >= 2000) {
          await sendBlob(blob, `tab.${ext}`);
        }
        if (!runLoopRef.current) break;
      }
    })();
  }, [disabled, onCaptureStateChange, sendBlob, stopAll]);

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-700/80 bg-zinc-900/40 p-3 space-y-2",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-amber-200/80">Laptop: meeting tab se audio (Chrome / Edge)</p>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Jab <strong>Zoom / Google Meet browser tab</strong> mein chal raha ho: is button se tab share karein, dialog mein{" "}
        <strong>“Share tab audio”</strong> (ya similar) on rakhein. Installed desktop Zoom app ka audio yahaan nahi
        aata—sirf web tab. Practice / mock use.
      </p>
      <div className="flex flex-wrap gap-2">
        {!active ? (
          <Button
            type="button"
            onClick={() => void start()}
            className="gap-2 bg-amber-600/90 hover:bg-amber-500 text-zinc-950"
          >
            <MonitorPlay className="h-4 w-4" />
            Share meeting tab
          </Button>
        ) : (
          <Button type="button" onClick={stopAll} variant="outline" className="gap-2 border-zinc-600 text-zinc-200">
            <StopCircle className="h-4 w-4" />
            Stop tab capture
          </Button>
        )}
        {busy && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-200/80">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Transcribing…
          </span>
        )}
      </div>
      {hint && (
        <p className="text-xs text-amber-300/90 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hint}
        </p>
      )}
    </div>
  );
}
