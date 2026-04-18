"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { MessageSquare, Loader2, ArrowRight, BarChart3, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [filterRound, setFilterRound] = useState("all");

  function loadSessions(p = 1) {
    setLoading(true);
    fetch(`/api/interview/list?page=${p}`)
      .then((r) => r.json())
      .then((d) => {
        setSessions(d.sessions ?? []);
        setTotalPages(d.pages ?? 1);
        setTotal(d.total ?? 0);
        setPage(p);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadSessions(1); }, []);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.role.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterDifficulty !== "all" && s.difficulty !== filterDifficulty) return false;
      if (filterRound !== "all" && s.roundType !== filterRound) return false;
      return true;
    });
  }, [sessions, search, filterStatus, filterDifficulty, filterRound]);

  const hasFilters = search || filterStatus !== "all" || filterDifficulty !== "all" || filterRound !== "all";

  function clearFilters() {
    setSearch("");
    setFilterStatus("all");
    setFilterDifficulty("all");
    setFilterRound("all");
  }

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
          <p className="text-muted-foreground mt-1">{total} sessions total</p>
        </div>
        <Button asChild>
          <Link href="/interview/setup">New Interview</Link>
        </Button>
      </div>

      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by title or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Difficulty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRound} onValueChange={setFilterRound}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Round" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rounds</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="hr">HR</SelectItem>
              <SelectItem value="behavioral">Behavioral</SelectItem>
              <SelectItem value="system_design">System Design</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-semibold">No interviews yet</h2>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Start your first mock interview</p>
          <Button asChild><Link href="/interview/setup">Start Interview</Link></Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <p className="text-muted-foreground text-sm">No sessions match your filters</p>
          <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2">Clear filters</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
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
                      <span className={`capitalize ${s.status === "completed" ? "text-green-500" : s.status === "active" ? "text-blue-400" : "text-yellow-500"}`}>
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
          {filtered.length < sessions.length && (
            <p className="text-center text-xs text-muted-foreground pt-1">
              Showing {filtered.length} of {sessions.length} sessions
            </p>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => loadSessions(page - 1)} disabled={page <= 1 || loading}>
                ← Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => loadSessions(page + 1)} disabled={page >= totalPages || loading}>
                Next →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
