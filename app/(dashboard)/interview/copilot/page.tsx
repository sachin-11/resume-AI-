"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSTT } from "@/hooks/use-speech";
import { Button } from "@/components/ui/button";
import { CopilotTabAudio } from "@/components/interview/copilot-tab-audio";
import { CopilotWhisperMic } from "@/components/interview/copilot-whisper-mic";
import { cn } from "@/lib/utils";
import { Loader2, Mic, MicOff, ChevronDown, ChevronUp, Headphones, AlertCircle, Info, Smartphone, Copy, Unlink } from "lucide-react";

type HistoryItem = { id: string; q: string; a: string };

const ANSWER_PREVIEW_CHARS = 420;

export default function InterviewCopilotPage() {
  const [liveTranscript, setLiveTranscript] = useState("");
  const [continuous, setContinuous] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastQ, setLastQ] = useState<string | null>(null);
  const [lastA, setLastA] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [showTabTools, setShowTabTools] = useState(false);
  /** true = turant answer on whatever you said (default). false = "smart" filter. */
  const [directMode, setDirectMode] = useState(true);
  /** Aap yahan sahi text likho — "Node.js" jaisa STT browser pe aksar kharab. */
  const [fixText, setFixText] = useState("");
  /** false = chup hone pe auto-answer nahi; pehle fix likho phir "Use" dabao. */
  const [autoOnSilence, setAutoOnSilence] = useState(true);
  const [sttLang, setSttLang] = useState("en-IN");
  /** `whisper` = Groq server (behtar English/tech) · `browser` = Web Speech (free, weak) */
  const [sttEngine, setSttEngine] = useState<"whisper" | "browser">("whisper");
  const [whisperOn, setWhisperOn] = useState(false);
  const [whisperBusy, setWhisperBusy] = useState(false);
  const [whisperError, setWhisperError] = useState<string | null>(null);
  /** Laptop → same user’s phone: shared DB session + poll + answer on /interview/phone */
  const [linkInfo, setLinkInfo] = useState<{ sessionId: string; joinUrl: string; code: string } | null>(null);
  const [linkCreateBusy, setLinkCreateBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [syncToPhone, setSyncToPhone] = useState(true);
  /** Sirf Chrome "Share meeting tab" + tab audio se aaya hua (interviewer / call output), mic+Whisper alag */
  const [meetingTranscript, setMeetingTranscript] = useState("");
  /** true = phone par sirf meetingTranscript; false = purana: mic/Whisper wala bhi bhejo */
  const [phoneSyncFromMeetingOnly, setPhoneSyncFromMeetingOnly] = useState(true);
  const linkPushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processingRef = useRef(false);
  const autoOnSilenceRef = useRef(autoOnSilence);
  const startRef = useRef<() => void>(() => {});
  const continuousRef = useRef(continuous);
  const directRef = useRef(directMode);
  /** When desktop tab-audio is active, do not auto-restart phone mic in runProcess. */
  const tabCaptureRef = useRef(false);
  const [meetingTabActive, setMeetingTabActive] = useState(false);
  const sttEngineRef = useRef(sttEngine);
  const whisperAccRef = useRef("");
  const whisperDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);
  useEffect(() => {
    sttEngineRef.current = sttEngine;
  }, [sttEngine]);
  useEffect(() => {
    directRef.current = directMode;
  }, [directMode]);
  useEffect(() => {
    autoOnSilenceRef.current = autoOnSilence;
  }, [autoOnSilence]);

  useEffect(() => {
    if (linkPushRef.current) {
      clearTimeout(linkPushRef.current);
      linkPushRef.current = null;
    }
    if (!linkInfo || !syncToPhone) return;
    const t = (phoneSyncFromMeetingOnly ? meetingTranscript : liveTranscript).trim();
    if (t.length < 1) return;
    linkPushRef.current = setTimeout(() => {
      void fetch("/api/copilot-link/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: linkInfo.sessionId, text: t }),
      }).catch(() => {
        /* ignore */
      });
    }, 1000);
    return () => {
      if (linkPushRef.current) {
        clearTimeout(linkPushRef.current);
        linkPushRef.current = null;
      }
    };
  }, [linkInfo, syncToPhone, liveTranscript, meetingTranscript, phoneSyncFromMeetingOnly]);

  const runProcess = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (t.length < 8) return;

      if (processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      setError(null);

      try {
        const res = await fetch("/api/interview/copilot/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: t, direct: directRef.current }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Request failed");
          return;
        }
        if (data.action === "skip") {
          return;
        }
        if (data.action === "answer" && data.question && data.answer) {
          setLastQ(data.question);
          setLastA(data.answer);
          setAnswerExpanded(false);
          setHistory((prev) => {
            const item: HistoryItem = {
              id: `${Date.now()}`,
              q: data.question,
              a: data.answer,
            };
            return [item, ...prev].slice(0, 8);
          });
        }
      } catch {
        setError("Network error. Check connection and try again.");
      } finally {
        processingRef.current = false;
        setProcessing(false);
        if (continuousRef.current && !tabCaptureRef.current) {
          if (sttEngineRef.current === "browser") {
            window.setTimeout(() => startRef.current(), 500);
          }
        } else if (!continuousRef.current && sttEngineRef.current === "whisper") {
          setWhisperOn(false);
        }
      }
    },
    []
  );

  const handleInterim = useCallback((t: string) => setLiveTranscript(t), []);

  const onWhisperChunk = useCallback(
    (t: string) => {
      if (!t) return;
      const next = (whisperAccRef.current + (whisperAccRef.current ? " " : "") + t).trim().slice(0, 2000);
      whisperAccRef.current = next;
      setLiveTranscript(next);
      if (whisperDebounceRef.current) clearTimeout(whisperDebounceRef.current);
      whisperDebounceRef.current = setTimeout(() => {
        if (autoOnSilenceRef.current && next.length >= 8) void runProcess(next);
      }, 2800);
    },
    [runProcess]
  );

  const onSilenceAutoSubmit = useCallback(
    (t: string) => {
      if (!autoOnSilenceRef.current) return;
      void runProcess(t);
    },
    [runProcess]
  );

  const { start, stop, listening, supported, countdown, canSubmit, sttError, clearSttError } =
    useSTT({
      onInterim: handleInterim,
      onAutoSubmit: onSilenceAutoSubmit,
      silenceMs: 2000,
      minWords: 3,
      lang: sttLang,
    });

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    setShowTabTools(typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
  }, []);

  const langInit = useRef(false);
  useEffect(() => {
    if (sttEngine !== "browser") return;
    if (!langInit.current) {
      langInit.current = true;
      return;
    }
    stop();
  }, [sttLang, sttEngine, stop]);

  const prevStt = useRef(sttEngine);
  useEffect(() => {
    if (prevStt.current !== sttEngine) {
      if (sttEngine === "whisper" && listening) stop();
      if (sttEngine === "browser") setWhisperOn(false);
      whisperAccRef.current = "";
      if (whisperDebounceRef.current) clearTimeout(whisperDebounceRef.current);
    }
    prevStt.current = sttEngine;
  }, [sttEngine, listening, stop]);

  const prevW = useRef(false);
  useEffect(() => {
    if (sttEngine === "whisper" && whisperOn && !prevW.current) {
      whisperAccRef.current = "";
      setWhisperError(null);
    }
    prevW.current = whisperOn;
  }, [whisperOn, sttEngine]);

  const handleTabTranscript = useCallback(
    (text: string) => {
      const t = text.trim();
      if (t.length < 8) return;
      setMeetingTranscript(t);
      setLiveTranscript(t);
      void runProcess(t);
    },
    [runProcess]
  );

  const handleProcessManual = useCallback(() => {
    const t = fixText.trim() || liveTranscript.trim();
    if (t.length < 8) {
      setError("Thoda sa text chahiye — mic se bolo ya neeche sahi sawal type karo.");
      return;
    }
    if (sttEngine === "browser") stop();
    void runProcess(t);
  }, [fixText, liveTranscript, runProcess, stop, sttEngine]);

  const toggleListen = useCallback(() => {
    if (sttEngine === "whisper") {
      if (listening) stop();
      setWhisperOn((w) => !w);
      setWhisperError(null);
      setError(null);
      return;
    }
    if (whisperOn) setWhisperOn(false);
    if (listening) {
      stop();
      return;
    }
    clearSttError();
    setError(null);
    start();
  }, [sttEngine, whisperOn, listening, start, stop, clearSttError]);

  return (
    <div className="min-h-[calc(100vh-4rem)] -mx-4 -mb-4 px-4 pb-8 bg-zinc-950 text-zinc-100 sm:mx-0 sm:mb-0 sm:rounded-2xl sm:border sm:border-zinc-800/80">
      <div className="max-w-md mx-auto pt-2 space-y-4">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-violet-400">
            <Headphones className="h-6 w-6 shrink-0" />
            <h1 className="text-lg font-semibold tracking-tight">AI Interview Copilot</h1>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">Mock &amp; personal practice only.</strong> Suggested answers are
            silent — no sound from this page. Follow your interview host&apos;s rules and applicable laws.
          </p>
        </header>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-200/90">
            <Smartphone className="h-4 w-4 shrink-0" />
            Phone: answer yahan, sunai laptop se
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">Interviewer ke sawal:</strong> laptop (Chrome) par neeche{" "}
            <strong className="text-amber-200/90">“Share meeting tab”</strong> on rakho, call{" "}
            <strong>browser tab</strong> mein ho. Default: phone par <strong>sirf meeting</strong> wala text jata
            hai—apna mic/Whisper alag. Token ~2h.
          </p>
          {!linkInfo ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
              disabled={linkCreateBusy}
              onClick={async () => {
                setLinkErr(null);
                setLinkCreateBusy(true);
                try {
                  const res = await fetch("/api/copilot-link/create", { method: "POST" });
                  const d = await res.json();
                  if (!res.ok) {
                    setLinkErr(d.error ?? "Could not create link");
                    return;
                  }
                  setLinkInfo({
                    sessionId: d.sessionId,
                    joinUrl: d.joinUrl,
                    code: d.code,
                  });
                } catch {
                  setLinkErr("Network error");
                } finally {
                  setLinkCreateBusy(false);
                }
              }}
            >
              {linkCreateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              Create phone link
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-zinc-300">
                Code: <span className="font-mono text-emerald-300 tracking-widest">{linkInfo.code}</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
                <div className="shrink-0 rounded-lg border border-zinc-700 bg-white p-1.5 w-fit mx-auto sm:mx-0">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(linkInfo.joinUrl)}`}
                    alt="QR: open on phone"
                    width={180}
                    height={180}
                    className="block"
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5 text-[11px] text-zinc-500 break-all">
                  <a href={linkInfo.joinUrl} className="text-violet-400 underline" target="_blank" rel="noreferrer">
                    {linkInfo.joinUrl}
                  </a>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 border-zinc-600 text-zinc-200"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(linkInfo.joinUrl);
                        } catch {
                          /* */
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy link
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 border-zinc-600 text-amber-200/80"
                      onClick={async () => {
                        if (!linkInfo) return;
                        try {
                          const res = await fetch(
                            `/api/copilot-link/session?id=${encodeURIComponent(linkInfo.sessionId)}`,
                            { method: "DELETE" }
                          );
                          if (res.ok) {
                            setLinkInfo(null);
                            setLinkErr(null);
                          } else {
                            setLinkErr("Could not end link");
                          }
                        } catch {
                          setLinkErr("Network error");
                        }
                      }}
                    >
                      <Unlink className="h-3.5 w-3.5" /> End link
                    </Button>
                  </div>
                </div>
              </div>
              <label className="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={phoneSyncFromMeetingOnly}
                  onChange={(e) => setPhoneSyncFromMeetingOnly(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-600 bg-zinc-900"
                />
                <span>
                  <strong className="text-emerald-200/90">Phone = sirf meeting tab (interviewer)</strong> — apni
                  mic/Whisper wala phone par na bhejein. Band = poora &quot;Live text&quot; (aap bhi bol rahe ho to woh
                  bhi jayega).
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none pl-0.5">
                <input
                  type="checkbox"
                  checked={syncToPhone}
                  onChange={(e) => setSyncToPhone(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-900"
                />
                Chosen text phone par bhejo (debounced)
              </label>
              {phoneSyncFromMeetingOnly && linkInfo && !meetingTranscript.trim() && (
                <p className="text-[11px] text-amber-400/90 leading-snug pl-0.5">
                  Abhi phone ko kuch nahi bhej rahe: pehle laptop par <strong>Share meeting tab</strong> se meeting
                  audio capture karein. Sirf &quot;Start listening (mic)&quot; se interviewer ki awaaz nahi aati.
                </p>
              )}
            </div>
          )}
          {linkErr && <p className="text-[11px] text-amber-400">{linkErr}</p>}
        </div>

        <details className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400 leading-relaxed group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-zinc-300 font-medium select-none [&::-webkit-details-marker]:hidden">
            <Info className="h-4 w-4 text-violet-400 shrink-0" />
            Phone: laptop ki awaaz weak / aap bolate ho to clear — kyu?
            <ChevronDown className="h-4 w-4 ml-auto group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-2 space-y-2 pl-0.5 border-t border-zinc-800/80 pt-2">
            <p>
              <strong className="text-zinc-300">Hindi:</strong> Browser sirf <strong>phone ke mic</strong> se sunta hai,
              “laptop” se seedha nahi. Aap jab <strong>paas muh se bolte ho</strong> to woh sabse zyada loud + clear
              aata hai. Laptop <strong>speakers se</strong> aane wali call ki awaaz <strong>door se + kam + echo</strong>{" "}
              lagti hai; phone isko kabhi “echo” samajh kar <strong>suppress</strong> bhi kar deta hai. Isliye
              transcribe aksar aapki voice mein behtar hota hai, speaker wali se weak / repeat-words dikh sakta hai.
            </p>
            <p>
              <strong className="text-zinc-300">Tips (mobile):</strong> phone ko laptop <strong>speaker ke paas</strong>{" "}
              rakhein, call volume <strong>zyada</strong>, room mein <strong>shor kam</strong>. Practice: question repeat
              karke bolen (zyaada clear) — yeh ab bhi <strong>mic + browser limit</strong> hai, magic fix nahi.
            </p>
            <p className="text-zinc-500">
              <strong className="text-zinc-400">Laptop (Chrome):</strong> agar meet <strong>browser tab</strong> mein hai
              to neeche <strong>“Share meeting tab”</strong> se tab + tab audio lo — wahaan laptop{" "}
              <strong>direct</strong> meeting sound bhejta hai (app install Zoom par yeh feature kaam nahi karega).
            </p>
            <p>
              <strong className="text-zinc-300">“Node.js” jaisa galat kyu?</strong> Chrome/Android ka <strong>Web Speech
              (STT) English</strong> product / tech shabdon ke liye train nahi; aksar aise hi galat likhta hai. Yeh
              aapke server / AI se zyada <strong>browser wala sunai</strong> ka issue hai. Neeche &quot;Sahi sawal&quot;
              box mein type karo, ya <strong>auto-answer off</strong> karke theek text ke saath &quot;Use&quot; dabao.
            </p>
          </div>
        </details>

        {showTabTools && (
          <CopilotTabAudio
            onTranscript={handleTabTranscript}
            onCaptureStateChange={(on) => {
              tabCaptureRef.current = on;
              setMeetingTabActive(on);
              if (on) {
                stop();
                setWhisperOn(false);
              } else {
                setMeetingTranscript("");
              }
            }}
          />
        )}

        <CopilotWhisperMic
          active={whisperOn && sttEngine === "whisper"}
          apiLang={sttLang.toLowerCase().startsWith("hi") ? "hi" : "en"}
          onTextChunk={onWhisperChunk}
          onBusy={setWhisperBusy}
          onError={setWhisperError}
        />

        <label className="flex items-start gap-2 rounded-lg border border-violet-500/25 bg-violet-950/30 p-3 text-xs text-zinc-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={directMode}
            onChange={(e) => setDirectMode(e.target.checked)}
            className="mt-0.5 rounded border-zinc-600 bg-zinc-900"
          />
          <span>
            <strong className="text-violet-200">Turant jawab (direct)</strong> — sun ke jo capture hua, usi par seedha
            answer, alag se generate / filter nahi. Band karoge to &quot;Smart&quot;: sirf jahan AI ko sawaal lage, wahi
            answer (dheere + kabhi skip).
          </span>
        </label>

        <div className="space-y-1.5">
          <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
            <span className="text-zinc-300 font-medium">Sunai / STT engine</span>
            <select
              value={sttEngine}
              onChange={(e) => setSttEngine(e.target.value as "whisper" | "browser")}
              className="w-full rounded-md border border-violet-500/30 bg-zinc-900 text-zinc-200 px-2 py-2 text-xs"
            >
              <option value="whisper">Whisper (Groq) — behtar English, Node.js, tech</option>
              <option value="browser">Browser only — jaldi, quality kam, offline jaisa</option>
            </select>
            <span className="text-[10px] text-zinc-500">
              Whisper: har ~5s audio server bhejta hai (GROQ_API_KEY) — thoda time + thoda cost. Browser: tumhare phone ka STT, galat shabd zyada.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border",
              (sttEngine === "browser" && listening) || (sttEngine === "whisper" && whisperOn)
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "bg-zinc-800/80 text-zinc-400 border-zinc-700"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                (sttEngine === "browser" && listening) || (sttEngine === "whisper" && whisperOn)
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-zinc-600"
              )}
            />
            {sttEngine === "whisper" && whisperOn
              ? whisperBusy
                ? "Whisper…"
                : "Listening (Whisper)"
              : sttEngine === "browser" && listening
                ? "Listening (browser)"
                : "Mic off"}
            {sttEngine === "browser" && countdown > 0 ? ` · ${countdown}s` : ""}
          </div>
          {processing && (
            <span className="inline-flex items-center gap-1 text-xs text-violet-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating…
            </span>
          )}
        </div>

        {sttEngine === "browser" && !supported && (
          <p className="text-xs text-amber-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            Speech recognition is not available in this browser. Try Chrome, or switch to Whisper mode above, or type in
            the box below.
          </p>
        )}

        {sttEngine === "browser" && sttError && (
          <p className="text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {sttError}
          </p>
        )}

        {whisperError && (
          <p className="text-xs text-amber-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {whisperError}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2 text-xs text-zinc-500">
          <label className="flex flex-col gap-0.5">
            <span>
              {sttEngine === "whisper" ? "Bhasha (Whisper API)" : "STT bhasha (browser)"}
            </span>
            <select
              value={sttLang}
              onChange={(e) => setSttLang(e.target.value)}
              className="rounded-md border border-zinc-600 bg-zinc-900 text-zinc-200 px-2 py-1.5 text-xs"
            >
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="hi-IN">Hindi (हिन्दी)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={toggleListen}
            disabled={sttEngine === "browser" && !supported}
            className={cn(
              "flex-1 min-w-[8rem] gap-2",
              listening ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-violet-600 hover:bg-violet-500"
            )}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {listening ? "Pause listening" : "Start listening"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleProcessManual}
            disabled={processing || (fixText.trim() || liveTranscript.trim()).length < 8}
            className="border-zinc-600 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            Get answer
          </Button>
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoOnSilence}
            onChange={(e) => setAutoOnSilence(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900"
          />
          Chup hote hi auto-answer (band = pehle neeche sahi text, phir &quot;Get answer&quot;)
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={continuous}
            onChange={(e) => setContinuous(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900"
          />
          After each answer, resume listening (continuous practice)
        </label>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-amber-200/80">Sahi sawal (agar upar STT ne galat likha)</p>
          <textarea
            value={fixText}
            onChange={(e) => setFixText(e.target.value)}
            rows={2}
            placeholder="e.g. what is node js"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setFixText(liveTranscript)}
              className="text-[11px] text-violet-400 hover:text-violet-300 underline-offset-2 hover:underline"
            >
              Copy live transcript yahan
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 min-h-[4.5rem]">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            {meetingTabActive
              ? "Live text — meeting tab (interviewer / call audio; phone pe yahi default)"
              : sttEngine === "whisper"
                ? "Live text (Whisper / mic aap ke paas se)"
                : "Live text (Browser STT — tech words aksar wrong)"}
          </p>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words min-h-[3rem]">
            {liveTranscript ||
              (sttEngine === "whisper" && whisperOn
                ? "… (bolte raho, pehle text ~5s mein aayega)"
                : sttEngine === "browser" && listening
                  ? "…"
                  : "Start dabao, mic allow karo, phir bolo.")}
          </p>
          {sttEngine === "browser" && listening && canSubmit && (
            <p className="text-[10px] text-zinc-500 mt-1">Chup hoke ~2s = auto-send (browser only)</p>
          )}
        </div>

        {lastQ && lastA && (
          <section className="rounded-xl border border-violet-500/30 bg-zinc-900/80 p-4 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Latest question</p>
            <p className="text-sm text-zinc-200 font-medium leading-relaxed">Q: {lastQ}</p>
            <div className="h-px bg-zinc-800" />
            <p className="text-[10px] uppercase tracking-wider text-violet-400/90">Suggested answer</p>
            <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {answerExpanded || lastA.length <= ANSWER_PREVIEW_CHARS ? (
                lastA
              ) : (
                <>
                  {lastA.slice(0, ANSWER_PREVIEW_CHARS)}…
                  <button
                    type="button"
                    onClick={() => setAnswerExpanded(true)}
                    className="mt-2 flex items-center gap-1 text-violet-400 text-xs font-medium"
                  >
                    Read more
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {answerExpanded && lastA.length > ANSWER_PREVIEW_CHARS && (
                <button
                  type="button"
                  onClick={() => setAnswerExpanded(false)}
                  className="mt-2 flex items-center gap-1 text-zinc-500 text-xs"
                >
                  Show less
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </section>
        )}

        {history.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 w-full text-left py-1"
            >
              {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Previous Q&amp;A ({history.length})
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-3 max-h-64 overflow-y-auto pr-1">
                {history.map((item) => (
                  <li key={item.id} className="rounded-lg border border-zinc-800 bg-black/20 p-3 text-xs">
                    <p className="text-zinc-400 font-medium mb-1">Q: {item.q}</p>
                    <p className="text-zinc-500 whitespace-pre-wrap line-clamp-4">{item.a}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-[10px] text-zinc-600 text-center">TTS is off. No sound plays from this page.</p>
      </div>
    </div>
  );
}
