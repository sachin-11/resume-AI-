"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brain, Loader2, CheckCircle, AlertCircle, ArrowRight, Clock, Mic, Volume2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDifficultyColor, getRoundTypeLabel } from "@/lib/utils";
import { CandidateInterviewSession } from "@/components/interview/candidate-session";
import { LANGUAGES, UI_STRINGS, type SupportedLang } from "@/lib/i18n";

interface CampaignInfo {
  title: string;
  role: string;
  difficulty: string;
  roundType: string;
  questionCount: number;
  description?: string;
}

interface InviteInfo {
  id: string;
  email: string;
  name: string;
  status: string;
  sessionId: string | null;
}

type Stage = "loading" | "intro" | "interview" | "done" | "error" | "already_done";

export default function CandidateInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [stage, setStage] = useState<Stage>("loading");
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<SupportedLang>("en");

  useEffect(() => {
    fetch(`/api/interview/invite/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.completed) { setStage("already_done"); return; }
        if (d.error) { setError(d.error); setStage("error"); return; }
        setCampaign(d.campaign);
        setInvite(d.invite);
        // If already started, go straight to interview
        if (d.invite.sessionId) {
          setSessionId(d.invite.sessionId);
          setStage("interview");
        } else {
          setStage("intro");
        }
      })
      .catch(() => { setError("Failed to load interview"); setStage("error"); });
  }, [token]);

  async function handleStart() {
    setStarting(true);
    const res = await fetch(`/api/interview/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    const data = await res.json();
    if (res.ok) {
      setSessionId(data.session.id);
      setStage("interview");
    } else {
      setError(data.error ?? "Failed to start interview");
      setStage("error");
    }
    setStarting(false);
  }

  // ── Loading ──
  if (stage === "loading") return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        <p className="text-muted-foreground">Loading your interview...</p>
      </div>
    </div>
  );

  // ── Error ──
  if (stage === "error") return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Invalid Link</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </CardContent>
      </Card>
    </div>
  );

  // ── Already done ──
  if (stage === "already_done") return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Interview Completed</h2>
          <p className="text-muted-foreground text-sm">
            You have already completed this interview. Thank you for your time!
          </p>
        </CardContent>
      </Card>
    </div>
  );

  // ── Interview session ──
  if (stage === "interview" && sessionId) return (
    <CandidateInterviewSession
      sessionId={sessionId}
      token={token}
      candidateName={invite?.name ?? ""}
      language={language}
      onComplete={() => setStage("done")}
    />
  );

  // ── Done ──
  if (stage === "done") return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-green-500/30">
        <CardContent className="p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-bold mb-2 text-green-400">Interview Complete!</h2>
          <p className="text-muted-foreground text-sm">
            Thank you{invite?.name ? `, ${invite.name}` : ""}! Your responses have been submitted successfully.
            The hiring team will review your interview and get back to you.
          </p>
          <div className="mt-6 p-4 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <p className="text-xs text-violet-400">Powered by AI Resume Coach</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ── Intro / Welcome screen ──
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600">
            <Brain className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="font-bold">AI Resume Coach</p>
            <p className="text-xs text-muted-foreground">AI Interview Platform</p>
          </div>
        </div>

        <Card className="border-violet-500/20">
          <CardContent className="p-8 space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">
                Hello{invite?.name ? `, ${invite.name}` : ""}! 👋
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                You&apos;ve been invited to an AI-powered interview
              </p>
            </div>

            {/* Interview details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Position</span>
                <span className="text-sm font-semibold">{campaign?.role}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Round</span>
                <Badge variant="outline">{getRoundTypeLabel(campaign?.roundType ?? "")}</Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Difficulty</span>
                <Badge variant="secondary" className={getDifficultyColor(campaign?.difficulty ?? "")}>
                  {campaign?.difficulty}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Questions</span>
                <span className="text-sm font-semibold">{campaign?.questionCount} questions</span>
              </div>
            </div>

            {campaign?.description && (
              <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
                {campaign.description}
              </p>
            )}

            {/* Language selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> {UI_STRINGS[language].chooseLanguage}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(LANGUAGES) as [SupportedLang, typeof LANGUAGES[SupportedLang]][]).map(([code, lang]) => (
                  <button
                    key={code}
                    onClick={() => setLanguage(code)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                      language === code
                        ? "border-violet-500 bg-violet-500/10 text-violet-400"
                        : "border-border hover:bg-accent text-muted-foreground"
                    }`}
                  >
                    <span className="text-base">{lang.flag}</span>
                    <span className="font-medium">{lang.nativeLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Before you start</p>
              {[
                { icon: <Mic className="h-3.5 w-3.5" />, text: "Use Chrome or Edge for voice features" },
                { icon: <Volume2 className="h-3.5 w-3.5" />, text: "Find a quiet place with good microphone" },
                { icon: <Clock className="h-3.5 w-3.5" />, text: "Allow 15–30 minutes to complete" },
                { icon: <CheckCircle className="h-3.5 w-3.5" />, text: "Answer can only be submitted once" },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-violet-400">{icon}</span>
                  {text}
                </div>
              ))}
            </div>

            <Button className="w-full" size="lg" onClick={handleStart} disabled={starting}>
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {starting ? "Preparing your interview…" : UI_STRINGS[language].startInterview}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Invited as: <span className="text-violet-400">{invite?.email}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
