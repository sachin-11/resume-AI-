"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BarChart3, FileText, MessageSquare, TrendingUp, Upload, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreChart } from "@/components/dashboard/score-chart";
import { formatRelativeTime, getScoreColor } from "@/lib/utils";

interface Stats {
  totalInterviews: number;
  avgScore: number;
  totalResumes: number;
  lastActivity: string | null;
}

interface Trend {
  date: string;
  score: number;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats);
        setTrends(d.trends ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: "Total Interviews",
      value: stats?.totalInterviews ?? 0,
      icon: MessageSquare,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      title: "Avg Score",
      value: stats?.avgScore ? `${stats.avgScore}/100` : "N/A",
      icon: TrendingUp,
      color: getScoreColor(stats?.avgScore ?? 0),
      bg: "bg-green-500/10",
    },
    {
      title: "Resumes Uploaded",
      value: stats?.totalResumes ?? 0,
      icon: FileText,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Last Activity",
      value: stats?.lastActivity ? formatRelativeTime(stats.lastActivity) : "Never",
      icon: BarChart3,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {session?.user?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">Here&apos;s your interview prep overview</p>
        </div>
        <Button asChild>
          <Link href="/interview/setup">
            Start Interview <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ title, value, icon: Icon, color, bg }) => (
            <Card key={title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${bg}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {trends.length > 0 ? (
                <ScoreChart data={trends} />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No interview data yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Complete interviews to see your progress</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/upload-resume" className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent transition-colors group">
                <div className="rounded-lg bg-violet-500/10 p-2">
                  <Upload className="h-4 w-4 text-violet-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Upload Resume</p>
                  <p className="text-xs text-muted-foreground">Get AI analysis</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
              <Link href="/interview/setup" className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent transition-colors group">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Mock Interview</p>
                  <p className="text-xs text-muted-foreground">Practice with AI</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
              <Link href="/resume-report" className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent transition-colors group">
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Resume Reports</p>
                  <p className="text-xs text-muted-foreground">View analysis</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="success">Pro Tip</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Upload your resume first to get personalized interview questions tailored to your experience.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
