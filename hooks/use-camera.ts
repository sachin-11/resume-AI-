"use client";
import { useState, useRef, useCallback, useEffect } from "react";

export type CameraStatus = "idle" | "requesting" | "active" | "denied" | "error";

export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [enabled, setEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setStatus("active");
      setEnabled(true);
    } catch (err: unknown) {
      const error = err as { name?: string };
      setStatus(error?.name === "NotAllowedError" ? "denied" : "error");
      setEnabled(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    setEnabled(false);
  }, []);

  const toggleCamera = useCallback(() => {
    if (enabled) stopCamera();
    else startCamera();
  }, [enabled, startCamera, stopCamera]);

  // Attach stream to video element when ref is set
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {}); // autoplay policy — trigger play explicitly
    }
  }, []);

  // Capture a still frame from the video as base64 JPEG
  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !enabled) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  return { status, enabled, toggleCamera, startCamera, stopCamera, attachVideo, capturePhoto };
}
