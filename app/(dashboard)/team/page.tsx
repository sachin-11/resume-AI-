"use client";
import { useEffect, useState } from "react";
import {
  Users, Plus, Loader2, Trash2, Shield, Eye, Crown,
  Mail, UserCheck, Building2, X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Member {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; name: string; email: string; createdAt: string };
}

interface Org {
  id: string;
  name: string;
}

const ROLE_META = {
  recruiter: { label: "Recruiter", icon: <Shield className="h-3 w-3" />, color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  viewer:    { label: "Viewer",    icon: <Eye className="h-3 w-3" />,    color: "bg-secondary text-muted-foreground border-border" },
};

export default function TeamPage() {
  const { data: session } = useSession();
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  const [form, setForm] = useState({ email: "", name: "", role: "recruiter", orgName: "" });

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => {
        setOrg(d.org ?? null);
        setMembers(d.members ?? []);
        if (d.org) setForm((f) => ({ ...f, orgName: d.org.name }));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite() {
    if (!form.email) { setInviteError("Email is required"); return; }
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");

    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setInviting(false);

    if (!res.ok) {
      setInviteError(data.error ?? "Failed to invite");
    } else {
      setInviteSuccess(`Invite sent to ${form.email}`);
      setForm((f) => ({ ...f, email: "", name: "" }));
      // Reload members
      fetch("/api/team").then((r) => r.json()).then((d) => {
        setOrg(d.org ?? null);
        setMembers(d.members ?? []);
      });
      setTimeout(() => { setInviteSuccess(""); setShowInvite(false); }, 2000);
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    setUpdatingId(memberId);
    await fetch(`/api/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setMembers((p) => p.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
    setUpdatingId("");
  }

  async function handleRemove(memberId: string, email: string) {
    if (!confirm(`Remove ${email} from the team?`)) return;
    setDeletingId(memberId);
    await fetch(`/api/team/${memberId}`, { method: "DELETE" });
    setMembers((p) => p.filter((m) => m.id !== memberId));
    setDeletingId("");
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground mt-1">Manage your organization members</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowInvite(!showInvite)}>
            <Plus className="h-4 w-4" /> Invite Member
          </Button>
        )}
      </div>

      {/* Org info */}
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20">
            <Building2 className="h-6 w-6 text-violet-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">{org?.name ?? "Your Organization"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""} · Admin: {session?.user?.name}</p>
          </div>
          <Badge variant="outline" className="gap-1">
            <Crown className="h-3 w-3 text-yellow-400" /> Admin
          </Badge>
        </CardContent>
      </Card>

      {/* Invite form */}
      {showInvite && (
        <Card className="border-violet-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Invite Team Member</CardTitle>
              <button onClick={() => setShowInvite(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <CardDescription>They&apos;ll receive an email with login credentials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inviteError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{inviteError}</div>
            )}
            {inviteSuccess && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-400">✓ {inviteSuccess}</div>
            )}
            {!org && (
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input placeholder="e.g. Acme Corp" value={form.orgName}
                  onChange={(e) => setForm({ ...form, orgName: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" placeholder="member@company.com" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input placeholder="John Doe" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["recruiter", "viewer"] as const).map((r) => (
                  <button key={r} onClick={() => setForm({ ...form, role: r })}
                    className={`text-left rounded-lg border p-3 transition-all ${form.role === r ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-accent"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {ROLE_META[r].icon}
                      <span className="text-sm font-medium capitalize">{r}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r === "recruiter" ? "Create campaigns, invite candidates, view reports" : "View campaigns and reports only"}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleInvite} disabled={inviting || !form.email} className="w-full">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {inviting ? "Sending invite…" : "Send Invite"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" /> Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No team members yet</p>
              {isAdmin && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowInvite(true)}>
                  <Plus className="h-3.5 w-3.5" /> Invite first member
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((m) => {
                const meta = ROLE_META[m.role as keyof typeof ROLE_META] ?? ROLE_META.viewer;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    {/* Avatar */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-sm font-bold text-violet-400">
                      {(m.user.name || m.user.email).charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.user.name || m.user.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>
                      <p className="text-xs text-muted-foreground">Joined {formatDate(m.createdAt)}</p>
                    </div>
                    {/* Role badge / selector */}
                    {isAdmin ? (
                      <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}
                        disabled={updatingId === m.id}>
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          {updatingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recruiter">Recruiter</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={`gap-1 ${meta.color}`}>
                        {meta.icon} {meta.label}
                      </Badge>
                    )}
                    {/* Remove */}
                    {isAdmin && (
                      <button onClick={() => handleRemove(m.id, m.user.email)}
                        disabled={deletingId === m.id}
                        className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                        {deletingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role permissions reference */}
      <Card>
        <CardHeader><CardTitle className="text-base">Role Permissions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {[
              { role: "Admin", icon: <Crown className="h-4 w-4 text-yellow-400" />, perms: ["All permissions", "Invite/remove members", "Manage billing", "Create campaigns"] },
              { role: "Recruiter", icon: <Shield className="h-4 w-4 text-blue-400" />, perms: ["Create campaigns", "Invite candidates", "View all reports", "Export data"] },
              { role: "Viewer", icon: <Eye className="h-4 w-4 text-muted-foreground" />, perms: ["View campaigns", "View reports", "No edit access", "Read-only"] },
            ].map(({ role, icon, perms }) => (
              <div key={role} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  {icon}
                  <span className="font-medium text-sm">{role}</span>
                </div>
                <ul className="space-y-1">
                  {perms.map((p) => (
                    <li key={p} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <UserCheck className="h-3 w-3 shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
