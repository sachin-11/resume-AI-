"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Users, Plus, Trash2, Loader2, Shield, Eye, UserCog, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

type Role = "recruiter" | "viewer";

interface Member {
  id: string;
  role: Role;
  createdAt: string;
  user: { id: string; name: string; email: string; createdAt: string };
}

interface Org { id: string; name: string }

const ROLE_META: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  admin:     { label: "Admin",     color: "text-violet-400 bg-violet-500/15 border-violet-500/30", icon: <Crown className="h-3 w-3" />,   desc: "Full access to everything" },
  recruiter: { label: "Recruiter", color: "text-blue-400 bg-blue-500/15 border-blue-500/30",       icon: <UserCog className="h-3 w-3" />, desc: "Create campaigns, invite candidates" },
  viewer:    { label: "Viewer",    color: "text-green-400 bg-green-500/15 border-green-500/30",    icon: <Eye className="h-3 w-3" />,     desc: "Read-only access to reports" },
};

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? ROLE_META.viewer;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${m.color}`}>
      {m.icon}{m.label}
    </span>
  );
}

export default function TeamPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [form, setForm] = useState({ email: "", name: "", role: "recruiter" as Role });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => { setOrg(d.org); setMembers(d.members ?? []); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleInvite() {
    if (!form.email) return;
    setInviting(true); setInviteError("");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, orgName: orgName || "My Organization" }),
    });
    const data = await res.json();
    if (res.ok) {
      setShowInvite(false);
      setForm({ email: "", name: "", role: "recruiter" });
      load();
    } else {
      setInviteError(data.error ?? "Failed to invite");
    }
    setInviting(false);
  }

  async function handleRoleChange(memberId: string, role: Role) {
    setUpdatingId(memberId);
    await fetch(`/api/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setMembers((p) => p.map((m) => m.id === memberId ? { ...m, role } : m));
    setUpdatingId("");
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Remove this team member?")) return;
    setDeletingId(memberId);
    await fetch(`/api/team/${memberId}`, { method: "DELETE" });
    setMembers((p) => p.filter((m) => m.id !== memberId));
    setDeletingId("");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-muted-foreground mt-1">
            {org ? org.name : "Invite team members to collaborate"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowInvite(!showInvite)}>
            <Plus className="h-4 w-4" /> Invite Member
          </Button>
        )}
      </div>

      {/* ── Role permissions overview ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(ROLE_META).map(([role, meta]) => (
          <Card key={role} className={session?.user?.role === role ? "border-violet-500/40" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <RoleBadge role={role} />
                {session?.user?.role === role && <span className="text-[10px] text-muted-foreground">(you)</span>}
              </div>
              <p className="text-xs text-muted-foreground">{meta.desc}</p>
              <ul className="mt-2 space-y-0.5">
                {role === "admin" && ["All features", "Invite/remove members", "Delete campaigns", "View audio"].map((f) => (
                  <li key={f} className="text-[11px] text-muted-foreground flex items-center gap-1"><span className="text-green-500">✓</span>{f}</li>
                ))}
                {role === "recruiter" && ["Create campaigns", "Invite candidates", "View reports", "View audio"].map((f) => (
                  <li key={f} className="text-[11px] text-muted-foreground flex items-center gap-1"><span className="text-green-500">✓</span>{f}</li>
                ))}
                {role === "viewer" && ["View campaigns", "View reports", "View analytics"].map((f) => (
                  <li key={f} className="text-[11px] text-muted-foreground flex items-center gap-1"><span className="text-green-500">✓</span>{f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Invite form ── */}
      {showInvite && (
        <Card className="border-violet-500/30">
          <CardHeader><CardTitle className="text-base">Invite Team Member</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!org && (
              <div className="space-y-1.5">
                <Label>Organization Name</Label>
                <Input placeholder="e.g. Acme Corp" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Email</Label>
                <Input placeholder="member@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Name (optional)</Label>
                <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleInvite} disabled={!form.email || inviting}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {inviting ? "Inviting…" : "Add Member"}
              </Button>
              <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Members list ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Team Members ({members.length + 1})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Owner (you) */}
          <div className="flex items-center gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
              {(session?.user?.name || session?.user?.email || "A").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{session?.user?.name || "You"}</p>
              <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
            </div>
            <RoleBadge role="admin" />
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No team members yet. Invite someone to collaborate.
            </div>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                  {(m.user.name || m.user.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{m.user.name || m.user.email}</p>
                  <p className="text-xs text-muted-foreground">{m.user.email} · Joined {formatDate(m.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => handleRoleChange(m.id, v as Role)}
                      disabled={updatingId === m.id}
                    >
                      <SelectTrigger className="h-7 text-xs w-28">
                        {updatingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recruiter">Recruiter</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      disabled={deletingId === m.id}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      {deletingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
