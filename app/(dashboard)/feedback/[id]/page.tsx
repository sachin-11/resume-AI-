"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2, TrendingUp, MessageSquare, Brain, Zap,
  CheckCircle, AlertCircle, ArrowRight, Trophy,
  XCircle, MinusCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScoreRadarChart } from "@/components/feedback/score-radar-chart";
import { getScoreColor, formatDate } from "@/lib/utils";

interface FeedbackData {
  id: string;
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
  strengths: string[];
  weakAreas: string[];
  betterAnswers: Array<{ question: string; improvedAnswer: string; candidateAnswer?: string }>;
  improvementRoadmap: string[];
  summary: string;
  session: {
    title: string;
    role: string;
    roundType: string;
    difficulty: string;
    createdAt: string;
    questions: Array<{
      id: string;
      text: string;
      orderIndex: number;
      answers: Array<{ text: string }>;
    }>;
  };
}

// ── Grade logic ──────────────────────────────────────────────────
function getGrade(score: number): {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  desc: string;
} {
  if (score >= 85) return {
    label: "Excellent", color: "text-emerald-400", bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    icon: <Trophy className="h-8 w-8 text-emerald-400" />,
    desc: "Outstanding performance! You're well-prepared for this role.",
  };
  if (score >= 70) return {
    label: "Pass", color: "text-green-400", bg: "bg-green-500/10",
    border: "border-green-500/40",
    icon: <CheckCircle className="h-8 w-8 text-green-400" />,
    desc: "Good job! You demonstrated solid knowledge and communication.",
  };
  if (score >= 55) return {
    label: "Decent", color: "text-yellow-400", bg: "bg-yellow-500/10",
    border: "border-yellow-500/40",
    icon: <MinusCircle className="h-8 w-8 text-yellow-400" />,
    desc: "Average performance. Some areas need improvement before the real interview.",
  };
  return {
    label: "Needs Work", color: "text-red-400", bg: "bg-red-500/10",
    border: "border-red-500/40",
    icon: <XCircle className="h-8 w-8 text-red-400" />,
    desc: "Keep practicing! Focus on the improvement roadmap below.",
  };
}

function ScoreBar({ label, score, icon }: { label: string; score: number; icon: React.ReactNode }) {
  const color =
    score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}/100</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/feedback/${id}`)
      .then((r) => r.json())
      .then((d) => setFeedback(d.feedback))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        <p className="text-muted-foreground text-sm">Generating your feedback...</p>
      </div>
    );
  }

  if (!feedback) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Feedback not found</p>
        <Button asChild className="mt-4"><Link href="/dashboard">Go to Dashboard</Link></Button>
      </div>
    );
  }

  const grade = getGrade(feedback.overallScore);

  const radarData = [
    { subject: "Technical", score: feedback.technicalScore },
    { subject: "Communication", score: feedback.communicationScore },
    { subject: "Confidence", score: feedback.confidenceScore },
    { subject: "Overall", score: feedback.overallScore },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Interview Feedback</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {feedback.session.title} · {formatDate(feedback.session.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/history">History</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/interview/setup">
              New Interview <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      {/* ── SCORECARD ── */}
      <Card className={`border-2 ${grade.border}`}>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">

            {/* Grade badge */}
            <div className={`flex flex-col items-center justify-center rounded-2xl p-6 ${grade.bg} min-w-[140px]`}>
              {grade.icon}
              <span className={`text-2xl font-black mt-2 ${grade.color}`}>{grade.label}</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-4xl font-black ${grade.color}`}>{feedback.overallScore}</span>
                <span className="text-muted-foreground text-sm">/100</span>
              </div>
            </div>

            {/* Summary */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={`${grade.bg} ${grade.color} border ${grade.border} font-semibold`}
                >
                  {grade.label}
                </Badge>
                <Badge variant="outline" className="capitalize">{feedback.session.difficulty}</Badge>
                <Badge variant="secondary">{feedback.session.roundType.replace("_", " ")} Round</Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{grade.desc}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{feedback.summary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Score breakdown + Radar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Score Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ScoreBar
              label="Technical"
              score={feedback.technicalScore}
              icon={<Brain className="h-4 w-4 text-blue-400" />}
            />
            <ScoreBar
              label="Communication"
              score={feedback.communicationScore}
              icon={<MessageSquare className="h-4 w-4 text-green-400" />}
            />
            <ScoreBar
              label="Confidence"
              score={feedback.confidenceScore}
              icon={<Zap className="h-4 w-4 text-yellow-400" />}
            />
            <div className="pt-2 border-t border-border">
              <ScoreBar
                label="Overall"
                score={feedback.overallScore}
                icon={<Trophy className="h-4 w-4 text-violet-400" />}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Performance Radar</CardTitle></CardHeader>
          <CardContent>
            <ScoreRadarChart data={radarData} />
          </CardContent>
        </Card>
      </div>

      {/* ── Strengths & Weak Areas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {feedback.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-green-500 mt-0.5 shrink-0">✓</span>{s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" /> Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {feedback.weakAreas.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-yellow-500 mt-0.5 shrink-0">!</span>{w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ── Your Responses ── */}
      {(feedback.session.questions?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-400" /> Your Responses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback.session.questions
              .filter((q) => q.answers?.[0]?.text)
              .map((q, i) => (
                <div key={q.id} className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-sm font-semibold text-foreground">Q{i + 1}: {q.text}</p>
                  <div className="border-l-2 border-blue-500/50 pl-3">
                    <p className="text-xs text-blue-400 font-medium mb-1">Your Answer:</p>
                    <p className="text-sm text-muted-foreground">{q.answers[0].text}</p>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* ── Better Answers ── */}
      {feedback.betterAnswers?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-violet-500" /> Improved Answer Examples
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback.betterAnswers.map((item, i) => {
              // Match by question text similarity, fallback to index
              const questions = feedback.session.questions ?? [];
              const matched = questions.find(
                (q) => q.text.trim().toLowerCase() === item.question.trim().toLowerCase()
              ) ?? questions[i];
              const actualQuestion = matched?.text ?? item.question;
              // Prefer answer from DB (session questions), fallback to betterAnswers.candidateAnswer
              const userAnswer = matched?.answers?.[0]?.text ?? item.candidateAnswer;
              return (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  {/* Question */}
                  <p className="text-sm font-semibold text-foreground">
                    Q{i + 1}: {actualQuestion}
                  </p>
                  {/* User's answer */}
                  {userAnswer && (
                    <div className="border-l-2 border-muted pl-3">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Your Answer:</p>
                      <p className="text-sm text-muted-foreground">{userAnswer}</p>
                    </div>
                  )}
                  {/* Better answer */}
                  <div className="border-l-2 border-violet-500 pl-3">
                    <p className="text-xs text-violet-400 font-medium mb-1">Better Answer:</p>
                    <p className="text-sm text-muted-foreground">{item.improvedAnswer}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Improvement Roadmap ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" /> Improvement Roadmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {feedback.improvementRoadmap.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-400 text-xs font-bold">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="flex gap-3 justify-center pt-2">
        <Button variant="outline" asChild>
          <Link href="/history">View All Sessions</Link>
        </Button>
        <Button asChild>
          <Link href="/interview/setup">
            Practice Again <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
