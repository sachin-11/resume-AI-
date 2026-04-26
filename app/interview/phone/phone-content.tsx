"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MessageSquare, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const POLL_MS = 1600;
const AUTO_DEBOUNCE_MS = 3600;

type PollData = {
  ok: true;
  seq: number;
  text: string;
  lastQuestion: string | null;
  lastAnswer: string | null;
  updatedAt: string;
} | { ok: false; expired?: boolean; notFound?: boolean };

export function CopilotPhoneContent() {
  const search = useSearchParams();
  const token = search.get("t")?.trim() ?? "";
  const [data, setData] = useState<PollData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [auto, setAuto] = useState(false);
  const [direct, setDirect] = useState(true);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    if (!token) {
      setErr("Link incomplete — add ?t=… from the laptop.");
      return;
    }
    try {
      const res = await fetch(`/api/copilot-link/poll?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Poll failed");
        return;
      }
      setData((prev) => {
        if (prev && "ok" in prev && "ok" in j && prev.ok && j.ok) {
          if (
            prev.seq === j.seq &&
            prev.text === j.text &&
            prev.lastQuestion === j.lastQuestion &&
            prev.lastAnswer === j.lastAnswer
          ) {
            return prev;
          }
        }
        if (prev && "ok" in prev && "ok" in j && !prev.ok && !j.ok) {
          return prev;
        }
        return j as PollData;
      });
      setErr(null);
    } catch {
      setErr("Network error");
    }
  }, [token]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const postAnswer = useCallback(
    async (useLatest: boolean) => {
      if (!token) return;
      setAnswering(true);
      setErr(null);
      try {
        const res = await fetch("/api/copilot-link/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, useLatest, direct }),
        });
        const j = await res.json();
        if (!res.ok) {
          setErr(j.error ?? "Answer failed");
          return;
        }
        if (j.action === "skip") {
          setErr("Skipped (smart mode) — use Direct on laptop/phone, or add longer question text.");
        }
        void poll();
      } catch {
        setErr("Network error");
      } finally {
        setAnswering(false);
      }
    },
    [token, direct, poll]
  );

  const open = data && "ok" in data && data.ok;
  const dSeq = open ? data.seq : 0;
  const dText = open ? data.text : "";

  useEffect(() => {
    if (autoTimer.current) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
    if (!auto || !open || dText.trim().length < 8) return;
    autoTimer.current = setTimeout(() => {
      void postAnswer(true);
    }, AUTO_DEBOUNCE_MS);
    return () => {
      if (autoTimer.current) {
        clearTimeout(autoTimer.current);
        autoTimer.current = null;
      }
    };
  }, [auto, open, dSeq, dText, postAnswer]);

  if (!token) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-zinc-200 p-4 max-w-md mx-auto">
        <p className="text-amber-300 text-sm">Open this page from the link the laptop shows (it includes <code className="text-zinc-400">?t=…</code>).</p>
      </div>
    );
  }

  const ok = data && "ok" in data && data.ok;
  const expired = data && "ok" in data && !data.ok && "expired" in data && data.expired;
  const notFound = data && "ok" in data && !data.ok && "notFound" in data && data.notFound;

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-200 p-4 max-w-md mx-auto space-y-4">
      <header className="flex items-center gap-2 text-violet-400">
        <Phone className="h-6 w-6" />
        <h1 className="text-base font-semibold">Copilot (phone)</h1>
      </header>
      <p className="text-[11px] text-zinc-500">
        Text comes from the laptop (tab audio / STT). Same account, resume/RAG. Mock practice only.
      </p>

      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" size="sm" variant="secondary" onClick={() => void poll()}>
          <RefreshCw className="h-4 w-4" /> Sync
        </Button>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={direct}
            onChange={(e) => setDirect(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Direct (turant jawab)
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Auto-answer ~4s after text stops updating
        </label>
      </div>

      {notFound && <p className="text-sm text-amber-400">Invalid or expired link.</p>}
      {expired && <p className="text-sm text-amber-400">This link has expired. Create a new one on the laptop.</p>}
      {err && <p className="text-sm text-red-400">{err}</p>}

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-1">
        <p className="text-[10px] uppercase text-zinc-500">From laptop (latest)</p>
        {ok ? (
          <>
            <p className="text-xs text-zinc-500">seq {data.seq}</p>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap min-h-[4rem]">
              {data.text || "… (wait for the laptop to send audio → text)"}
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        <Button
          type="button"
          className="w-full mt-2"
          size="sm"
          disabled={answering || !ok || (ok && (data as Extract<PollData, { ok: true }>).text.trim().length < 8)}
          onClick={() => void postAnswer(true)}
        >
          {answering ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
          Get answer from this text
        </Button>
      </section>

      {ok && data.lastQuestion && data.lastAnswer && (
        <section className="rounded-lg border border-violet-500/30 bg-zinc-900/80 p-3 space-y-2">
          <p className="text-[10px] uppercase text-zinc-500">Latest</p>
          <p className="text-sm font-medium text-zinc-200">Q: {data.lastQuestion}</p>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{data.lastAnswer}</p>
        </section>
      )}
    </div>
  );
}
