"use client";
import { useState, useRef, useCallback, useEffect } from "react";

export interface ProctoringEvent {
  type: "multiple_faces" | "no_face" | "looking_away" | "noise_detected" | "copy_paste";
  message: string;
  timestamp: number;
  count: number;
}

export interface ProctoringStats {
  multipleFacesCount: number;
  noFaceCount: number;
  lookingAwayCount: number;
  noiseCount: number;
  copyPasteCount: number;
  totalViolations: number;
  integrityFlag: "clean" | "warning" | "suspicious";
}

interface UseProctoringOptions {
  sessionId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled?: boolean;
  onViolation?: (event: ProctoringEvent) => void;
  onFlagChange?: (flag: "clean" | "warning" | "suspicious", total: number) => void;
}

export function useProctoring({ sessionId, videoRef, enabled = true, onViolation, onFlagChange }: UseProctoringOptions) {
  const [stats, setStats] = useState<ProctoringStats>({
    multipleFacesCount: 0, noFaceCount: 0, lookingAwayCount: 0,
    noiseCount: 0, copyPasteCount: 0, totalViolations: 0,
    integrityFlag: "clean",
  });
  const [latestEvent, setLatestEvent] = useState<ProctoringEvent | null>(null);

  const statsRef = useRef(stats);
  const faceDetectorRef = useRef<unknown>(null);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noiseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const noFaceCounterRef = useRef(0); // consecutive no-face frames

  // ── Report violation ─────────────────────────────────────────
  const reportViolation = useCallback((type: ProctoringEvent["type"], message: string) => {
    setStats((prev) => {
      const next = { ...prev };
      if (type === "multiple_faces") next.multipleFacesCount++;
      else if (type === "no_face") next.noFaceCount++;
      else if (type === "looking_away") next.lookingAwayCount++;
      else if (type === "noise_detected") next.noiseCount++;
      else if (type === "copy_paste") next.copyPasteCount++;
      next.totalViolations++;
      statsRef.current = next;
      return next;
    });

    const event: ProctoringEvent = {
      type, message, timestamp: Date.now(),
      count: (statsRef.current[`${type === "multiple_faces" ? "multipleFaces" : type === "no_face" ? "noFace" : type === "looking_away" ? "lookingAway" : type === "noise_detected" ? "noise" : "copyPaste"}Count` as keyof ProctoringStats] as number) + 1,
    };
    setLatestEvent(event);
    onViolation?.(event);

    // Report to server (best-effort) + check flag
    fetch("/api/interview/public/tab-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, violationType: type }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.integrityFlag && data.integrityFlag !== "clean") {
          setStats((prev) => ({ ...prev, integrityFlag: data.integrityFlag, totalViolations: data.totalViolations }));
          onFlagChange?.(data.integrityFlag, data.totalViolations);
        }
      })
      .catch(() => {});
  }, [sessionId, onViolation]);

  // ── Face Detection (FaceDetector API) ───────────────────────
  const startFaceDetection = useCallback(async () => {
    // FaceDetector is experimental — Chrome only
    const FD = (window as unknown as { FaceDetector?: new () => { detect: (img: HTMLVideoElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> } }).FaceDetector;
    if (!FD) return;

    try {
      faceDetectorRef.current = new FD();
    } catch { return; }

    faceIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !faceDetectorRef.current) return;

      try {
        const detector = faceDetectorRef.current as { detect: (img: HTMLVideoElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> };
        const faces = await detector.detect(video);

        if (faces.length === 0) {
          noFaceCounterRef.current++;
          // Only flag after 3 consecutive no-face frames (avoid false positives)
          if (noFaceCounterRef.current >= 3) {
            reportViolation("no_face", "No face detected — candidate may have left");
            noFaceCounterRef.current = 0;
          }
        } else if (faces.length > 1) {
          noFaceCounterRef.current = 0;
          reportViolation("multiple_faces", `${faces.length} faces detected in frame`);
        } else {
          noFaceCounterRef.current = 0;
          // Eye tracking — check if face is centered (rough gaze estimation)
          const face = faces[0];
          const videoW = video.videoWidth || 320;
          const videoH = video.videoHeight || 240;
          const faceX = face.boundingBox.x + face.boundingBox.width / 2;
          const faceY = face.boundingBox.y + face.boundingBox.height / 2;
          const centerX = videoW / 2;
          const centerY = videoH / 2;
          const offsetX = Math.abs(faceX - centerX) / videoW;
          const offsetY = Math.abs(faceY - centerY) / videoH;

          // If face is more than 35% off-center → looking away
          if (offsetX > 0.35 || offsetY > 0.35) {
            reportViolation("looking_away", "Candidate appears to be looking away from screen");
          }
        }
      } catch { /* ignore detection errors */ }
    }, 3000); // check every 3 seconds
  }, [videoRef, reportViolation]);

  // ── Background Noise Detection ───────────────────────────────
  const startNoiseDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let noiseFrames = 0;

      noiseIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // avg > 40 = significant background noise
        if (avg > 40) {
          noiseFrames++;
          if (noiseFrames >= 3) {
            reportViolation("noise_detected", `Background noise detected (level: ${Math.round(avg)})`);
            noiseFrames = 0;
          }
        } else {
          noiseFrames = 0;
        }
      }, 2000);
    } catch { /* mic not available */ }
  }, [reportViolation]);

  // ── Copy-Paste Detection ─────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    function handleCopy(e: ClipboardEvent) {
      // Allow copying questions (read-only areas), block pasting answers
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        e.preventDefault();
        reportViolation("copy_paste", "Copy attempt blocked in answer field");
      }
    }

    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        e.preventDefault();
        reportViolation("copy_paste", "Paste attempt blocked — answers must be typed");
      }
    }

    function handleContextMenu(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        e.preventDefault(); // disable right-click in answer fields
      }
    }

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [enabled, reportViolation]);

  // ── Start / Stop ─────────────────────────────────────────────
  const start = useCallback(() => {
    if (!enabled) return;
    startFaceDetection();
    startNoiseDetection();
  }, [enabled, startFaceDetection, startNoiseDetection]);

  const stop = useCallback(() => {
    if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    if (noiseIntervalRef.current) clearInterval(noiseIntervalRef.current);
    audioContextRef.current?.close().catch(() => {});
  }, []);

  useEffect(() => () => stop(), [stop]);

  // Check if FaceDetector is supported
  const faceDetectionSupported = typeof window !== "undefined" &&
    !!(window as unknown as { FaceDetector?: unknown }).FaceDetector;

  return { stats, latestEvent, start, stop, faceDetectionSupported };
}
