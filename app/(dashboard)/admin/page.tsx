"use client";
import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Users, Search, Loader2, Crown, Zap, Building2,
  CheckCircle, Shield, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

interface User {
  id: string;
  name: string | null;
  email: string;
  plan: string;
  role: string;
  createdAt: string;
  interviewsThisMonth: number;
  phoneVerified: boolean;
  _count: { interviewSessions: number; resumes: number; campaigns: number };
}

const PLAN_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  free:       { icon: <Zap className="h-3 w-3" />,       color: "bg-secondary text-muted-foreground border-border",       label: "Free" },
  pro:        { icon: <Crown className="h-3 w-3" />,      color: "bg-violet-500/15 text-violet-400 border-violet-500/30",  label: "Pro" },
  enterprise: { icon: <Building2 className="h-3 w-3" />, color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", label: "Enterprise" },
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [planCounts, setPlanCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  // Redirect non-admins
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  function loadUsers(p = 1, q = search) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (q) params.set("search", q);
    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users ?? []);
        setTotal(d.total ?? 0);
        setPages(d.pages ?? 1);
        setPlanCounts(d.planCounts ?? {});
        setPage(p);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (status === "authenticated") loadUsers(); }, [status]);

  function handleSearch() {
    setSearch(searchInput);
    loadUsers(1, searchInput);
  }

  async function handlePlanChange(userId: string, plan: string) {
    setUpdatingId(userId);
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, plan }),
    });
    setUsers((p) => p.map((u) => u.id === userId ? { ...u, plan } : u));
    setUpdatingId("");
  }

  async function handleRoleChange(userId: string, role: string) {
    setUpdatingId(userId + "-role");
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    setUsers((p) => p.map((u) => u.id === userId ? { ...u, role } : u));
    setUpdatingId("");
  }

  if (status === "loading") return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const totalInterviews = users.reduce((s, u) => s + u._count.interviewSessions, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-violet-400" /> Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Manage users and platform overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-violet-400">{total}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Users</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-green-400">{planCounts.pro ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Pro Users</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-yellow-400">{planCounts.enterprise ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Enterprise</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-blue-400">{planCounts.free ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Free Users</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search by name or email…" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-8 h-9 text-sm" />
        </div>
        <Button size="sm" onClick={handleSearch} className="h-9">Search</Button>
        {search && <Button size="sm" variant="ghost" className="h-9" onClick={() => { setSearchInput(""); setSearch(""); loadUsers(1, ""); }}>Clear</Button>}
      </div>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Users ({total})</span>
            <span className="text-xs font-normal text-muted-foreground">Page {page}/{pages}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => {
                const planMeta = PLAN_META[u.plan] ?? PLAN_META.free;
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border p-3 flex-wrap">
                    {/* Avatar */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-sm font-bold text-violet-400">
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{u.name || "—"}</p>
                        {u.phoneVerified && (
                          <span title="Phone verified" className="inline-flex shrink-0">
                            <CheckCircle className="h-3 w-3 text-green-400" aria-hidden />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{u._count.interviewSessions} interviews</span>
                        <span>{u._count.resumes} resumes</span>
                        <span>{u._count.campaigns} campaigns</span>
                        <span>Joined {formatDate(u.createdAt)}</span>
                      </div>
                    </div>
                    {/* Plan selector */}
                    <Select value={u.plan} onValueChange={(v) => handlePlanChange(u.id, v)}
                      disabled={updatingId === u.id}>
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        {updatingId === u.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* Role selector */}
                    <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)}
                      disabled={updatingId === u.id + "-role" || u.email === "rajeshsachin786@gmail.com"}>
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        {updatingId === u.id + "-role"
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="candidate">👤 Candidate</SelectItem>
                        <SelectItem value="recruiter">🏢 Recruiter</SelectItem>
                        <SelectItem value="viewer">👁️ Viewer</SelectItem>
                        <SelectItem value="admin">🔑 Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => loadUsers(page - 1)} disabled={page <= 1 || loading}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
              <Button variant="outline" size="sm" onClick={() => loadUsers(page + 1)} disabled={page >= pages || loading}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
