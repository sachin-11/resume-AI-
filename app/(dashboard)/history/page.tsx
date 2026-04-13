"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Loader2, ArrowRight, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDifficultyColor, getRoundTypeLabel, formatRelativeTime, getScoreColor } from "@/lib/utils";

interface Session {
  id: string;
  title: string;
  role: string;
  difficulty: string;
  roundType: string;
  status: string;
  createdAt: string;
  feedbackReport: { overallScore: number } | null;
  _count: { questions: number };
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/interview/list")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Interview History</h1>
          <p className="text-muted-foreground mt-1">{sessions.length} sessions total</p>
        </div>
        <Button asChild>
          <Link href="/interview/setup">New Interview</Link>
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-semibold">No interviews yet</h2>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Start your first mock interview</p>
          <Button asChild><Link href="/interview/setup">Start Interview</Link></Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Card key={s.id} className="hover:border-violet-500/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <MessageSquare className="h-5 w-5 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{s.title}</p>
                      <Badge variant="outline" className={getDifficultyColor(s.difficulty)}>
                        {s.difficulty}
                      </Badge>
                      <Badge variant="secondary">{getRoundTypeLabel(s.roundType)}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{s._count.questions} questions</span>
                      <span>·</span>
                      <span>{formatRelativeTime(s.createdAt)}</span>
                      <span>·</span>
                      <span className={`capitalize ${s.status === "completed" ? "text-green-500" : "text-yellow-500"}`}>
                        {s.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.feedbackReport && (
                      <div className="text-right">
                        <p className={`text-lg font-bold ${getScoreColor(s.feedbackReport.overallScore)}`}>
                          {s.feedbackReport.overallScore}
                        </p>
                        <p className="text-xs text-muted-foreground">score</p>
                      </div>
                    )}
                    {s.status === "completed" && s.feedbackReport ? (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/feedback/${s.id}`}>
                          <BarChart3 className="h-3 w-3 mr-1" />Feedback
                        </Link>
                      </Button>
                    ) : s.status === "active" ? (
                      <Button size="sm" asChild>
                        <Link href={`/interview/session/${s.id}`}>
                          Continue <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
