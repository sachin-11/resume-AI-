"use client";
import { useState, useRef, useCallback } from "react";

export type RecorderStatus = "idle" | "recording" | "stopped" | "uploading" | "done" | "error";

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Pick best supported format
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect chunks every 1 second
      mediaRecorderRef.current = recorder;
      setStatus("recording");
    } catch (err) {
      console.error("[AUDIO_RECORDER] start failed:", err);
      setStatus("error");
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStatus("stopped");
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  // Stop recording + upload to server
  const stopAndUpload = useCallback(async (sessionId: string): Promise<boolean> => {
    const blob = await stop();
    if (!blob || blob.size < 1000) return false; // too small = nothing recorded

    setStatus("uploading");
    try {
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);
      formData.append("sessionId", sessionId);

      const res = await fetch("/api/interview/public/audio", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setStatus("done");
        return true;
      } else {
        setStatus("error");
        return false;
      }
    } catch (err) {
      console.error("[AUDIO_RECORDER] upload failed:", err);
      setStatus("error");
      return false;
    }
  }, [stop]);

  const isRecording = status === "recording";

  return { start, stop, stopAndUpload, status, isRecording };
}
