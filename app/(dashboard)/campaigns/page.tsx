"use client";
import { useEffect, useState } from "react";
import { Plus, Users, Link2, Mail, CheckCircle, Clock, Loader2, ChevronRight, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, getDifficultyColor, getRoundTypeLabel, getScoreColor } from "@/lib/utils";

interface Campaign {
  id: string;
  title: string;
  role: string;
  difficulty: string;
  roundType: string;
  questionCount: number;
  status: string;
  createdAt: string;
  _count: { invites: number };
  invites: Array<{ status: string }>;
}

interface Invite {
  id: string;
  email: string;
  name: string;
  status: string;
  emailSent: boolean;
  token: string;
  score: number | null;
  createdAt: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [copiedToken, setCopiedToken] = useState("");

  // Create campaign form
  const [form, setForm] = useState({
    title: "", role: "", difficulty: "intermediate",
    roundType: "technical", questionCount: 5, description: "",
  });
  const [creating, setCreating] = useState(false);

  // Invite form
  const [emailsRaw, setEmailsRaw] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteResults, setInviteResults] = useState<Array<{ email: string; link: string }>>([]);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setCampaigns(d.campaigns ?? []))
      .catch((err) => {
        console.error("Failed to load campaigns:", err);
        setCampaigns([]);
      })
      .finally(() => setLoading(false));
  }, []);

  async function loadInvites(campaign: Campaign) {
    setSelected(campaign);
    setInvitesLoading(true);
    setInviteResults([]);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/invites`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInvites(data.invites ?? []);
    } catch (err) {
      console.error("Failed to load invites:", err);
      setInvites([]);
    }
    setInvitesLoading(false);
  }

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, questionCount: Number(form.questionCount) }),
    });
    const data = await res.json();
    if (res.ok) {
      // Ensure invites array exists to avoid .filter crash
      const newCampaign = { ...data.campaign, invites: [], _count: { invites: 0 } };
      setCampaigns((p) => [newCampaign, ...p]);
      setShowCreate(false);
      setForm({ title: "", role: "", difficulty: "intermediate", roundType: "technical", questionCount: 5, description: "" });
    }
    setCreating(false);
  }

  async function handleInvite() {
    if (!selected) return;
    setInviting(true);

    // Parse emails — support comma, newline, semicolon separated
    const lines = emailsRaw.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const candidates = lines.map((line) => {
      // Support "Name <email>" format
      const match = line.match(/^(.+?)\s*<(.+?)>$/);
      if (match) return { name: match[1].trim(), email: match[2].trim() };
      return { email: line };
    });

    const res = await fetch(`/api/campaigns/${selected.id}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates, companyName, sendEmail }),
    });
    const data = await res.json();
    setInviteResults(data.results ?? []);
    setEmailsRaw("");
    setInviting(false);
    loadInvites(selected);
  }

  function copyLink(link: string, token: string) {
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(""), 2000);
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Interview Campaigns</h1>
          <p className="text-muted-foreground mt-1">Send AI interview links to multiple candidates</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" /> New Campaign
        </Button>
      </div>

      {/* Create Campaign Form */}
      {showCreate && (
        <Card className="border-violet-500/30">
          <CardHeader><CardTitle className="text-base">Create Campaign</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Campaign Title</Label>
                <Input placeholder="e.g. Backend Engineer Batch 1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Target Role</Label>
                <Input placeholder="e.g. Senior Node.js Developer" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Round Type</Label>
                <Select value={form.roundType} onValueChange={(v) => setForm({ ...form, roundType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technical">Technical Round</SelectItem>
                    <SelectItem value="hr">HR Round</SelectItem>
                    <SelectItem value="behavioral">Behavioral Round</SelectItem>
                    <SelectItem value="system_design">System Design</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Questions ({form.questionCount})</Label>
                <input type="range" min={3} max={15} value={form.questionCount}
                  onChange={(e) => setForm({ ...form, questionCount: Number(e.target.value) })}
                  className="w-full accent-violet-600" />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Input placeholder="Brief note for candidates" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!form.title || !form.role || creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />} Create Campaign
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign list */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              No campaigns yet. Create one to get started.
            </div>
          ) : campaigns.map((c) => {
            const completed = (c.invites ?? []).filter((i) => i.status === "completed").length;
            const abandoned = (c.invites ?? []).filter((i) => i.status === "abandoned").length;
            return (
              <button key={c.id} onClick={() => loadInvites(c)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${selected?.id === c.id ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-accent"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.role}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Badge variant="secondary" className={getDifficultyColor(c.difficulty)}>{c.difficulty}</Badge>
                  <Badge variant="outline" className="text-xs">{getRoundTypeLabel(c.roundType)}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c._count.invites} invited</span>
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{completed} done</span>
                  {abandoned > 0 && (
                    <span className="flex items-center gap-1 text-red-400">✗ {abandoned} left</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Campaign detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
              <Link2 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Select a campaign to manage invites</p>
            </div>
          ) : (
            <>
              {/* Invite section */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Send Invites — {selected.title}</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setShowInvite(!showInvite)}>
                      <Mail className="h-3.5 w-3.5" /> Add Candidates
                    </Button>
                  </div>
                </CardHeader>
                {showInvite && (
                  <CardContent className="space-y-4 pt-0">
                    <div className="space-y-1.5">
                      <Label>Email Addresses</Label>
                      <textarea
                        className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        placeholder={"One per line, or comma separated:\njohn@example.com\nJane Doe <jane@example.com>\nravi@company.com"}
                        value={emailsRaw}
                        onChange={(e) => setEmailsRaw(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Supports: email, Name &lt;email&gt;, comma or newline separated</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Company Name</Label>
                        <Input placeholder="Your Company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Send Email?</Label>
                        <div className="flex items-center gap-3 h-10">
                          <button onClick={() => setSendEmail(true)}
                            className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all ${sendEmail ? "border-violet-500 bg-violet-500/10 text-violet-400" : "border-border"}`}>
                            Yes, send email
                          </button>
                          <button onClick={() => setSendEmail(false)}
                            className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all ${!sendEmail ? "border-violet-500 bg-violet-500/10 text-violet-400" : "border-border"}`}>
                            Link only
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button onClick={handleInvite} disabled={!emailsRaw.trim() || inviting}>
                      {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      {inviting ? "Sending…" : "Send Invites"}
                    </Button>

                    {/* Generated links */}
                    {inviteResults.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-green-400">✓ {inviteResults.length} invite(s) created</p>
                        {inviteResults.map((r) => (
                          <div key={r.email} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                            <span className="text-xs text-muted-foreground flex-1 truncate">{r.email}</span>
                            <button onClick={() => copyLink(r.link, r.link)}
                              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 shrink-0">
                              {copiedToken === r.link ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              {copiedToken === r.link ? "Copied!" : "Copy link"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Candidates table */}
              <Card>
                <CardHeader><CardTitle className="text-base">Candidates ({invites.length})</CardTitle></CardHeader>
                <CardContent>
                  {invitesLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : invites.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">No candidates invited yet</p>
                  ) : (
                    <div className="space-y-2">
                      {invites.map((inv) => {
                        const link = `${appUrl}/interview/invite/${inv.token}`;
                        return (
                          <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{inv.name || inv.email}</p>
                              {inv.name && <p className="text-xs text-muted-foreground truncate">{inv.email}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {inv.score !== null && (
                                <span className={`text-sm font-bold ${getScoreColor(inv.score)}`}>{inv.score}/100</span>
                              )}
                              <Badge variant={
                                inv.status === "completed" ? "success" :
                                inv.status === "started" ? "warning" :
                                inv.status === "abandoned" ? "destructive" : "secondary"
                              }>
                                {inv.status === "completed" ? <CheckCircle className="h-3 w-3 mr-1" /> :
                                 inv.status === "abandoned" ? <span className="mr-1">✗</span> :
                                 <Clock className="h-3 w-3 mr-1" />}
                                {inv.status === "abandoned" ? "left midway" : inv.status}
                              </Badge>
                              <button onClick={() => copyLink(link, inv.token)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-violet-400 transition-colors">
                                {copiedToken === inv.token ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
