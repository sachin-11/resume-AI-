"use client";
import { useEffect, useState } from "react";
import { Plus, Users, Link2, Mail, CheckCircle, Clock, Loader2, ChevronRight, Copy, Check, Trash2, AlertCircle, Calendar, X, Download, FileText, GitCompare, Upload, StickyNote, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, getDifficultyColor, getRoundTypeLabel, getScoreColor } from "@/lib/utils";
import { generateCandidatePDF } from "@/lib/pdf-export";

interface Campaign {
  id: string; title: string; role: string; difficulty: string;
  roundType: string; questionCount: number; status: string; createdAt: string;
  _count: { invites: number }; invites: Array<{ status: string }>;
}

interface Invite {
  id: string; email: string; name: string; status: string;
  emailSent: boolean; token: string; score: number | null;
  createdAt: string; photoUrl: string | null; tabSwitchCount: number;
  hasAudio: boolean; sessionId: string | null;
  integrityFlag?: "clean" | "warning" | "suspicious";
  proctoring?: {
    multipleFaces: number; noFace: number; lookingAway: number;
    noise: number; copyPaste: number;
  };
}

interface Slot {
  id: string; startsAt: string; durationMin: number; isBooked: boolean;
}

// ── Bulk Email Button ────────────────────────────────────────────
function BulkEmailButton({ campaignId, completedCount }: { campaignId: string; completedCount: number }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  async function handleBulkEmail() {
    if (!completedCount || !confirm(`Send feedback emails to all ${completedCount} completed candidates?`)) return;
    setSending(true);
    const res = await fetch(`/api/campaigns/${campaignId}/bulk-email`, { method: "POST" });
    const data = await res.json();
    setResult(data);
    setSending(false);
    setTimeout(() => setResult(null), 4000);
  }

  if (result) return (
    <span className="text-xs text-green-400">✓ {result.sent} emails sent{result.failed > 0 ? `, ${result.failed} failed` : ""}</span>
  );

  return (
    <button onClick={handleBulkEmail} disabled={sending || completedCount === 0}
      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40">
      {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
      Bulk Email ({completedCount})
    </button>
  );
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
  const [emailChips, setEmailChips] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteResults, setInviteResults] = useState<Array<{ email: string; link: string }>>([]);
  const [inviteErrors, setInviteErrors] = useState<Array<{ email: string; error: string }>>([]);
  const [deletingId, setDeletingId] = useState("");
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [audioLoading, setAudioLoading] = useState<Record<string, boolean>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [transcriptLoading, setTranscriptLoading] = useState<Record<string, boolean>>({});
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [notesInviteId, setNotesInviteId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Array<{ id: string; text: string; createdAt: string }>>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [retakingId, setRetakingId] = useState("");

  // Slots state
  const [slots, setSlots] = useState<Slot[]>([]);
  const [showSlots, setShowSlots] = useState(false);
  const [newSlotDate, setNewSlotDate] = useState("");
  const [newSlotTime, setNewSlotTime] = useState("");
  const [newSlotDuration, setNewSlotDuration] = useState(30);
  const [addingSlot, setAddingSlot] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState("");

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
    setShowSlots(false);
    setSlots([]);
    setSelectedForCompare([]); // reset compare selection
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
    const allEmails = [...emailChips];
    if (emailInput.trim()) allEmails.push(emailInput.trim());

    const candidates = allEmails.map((line) => {
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
    setInviteErrors(data.errors ?? []);
    setEmailChips([]);
    setEmailInput("");
    setInviting(false);
    loadInvites(selected);
  }

  function addEmailChip(value: string) {
    const parts = value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      setEmailChips((prev) => [...prev, ...parts.filter((p) => !prev.includes(p))]);
    }
    setEmailInput("");
  }

  function removeChip(index: number) {
    setEmailChips((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleDeleteCampaign(campaignId: string) {
    if (!confirm("Delete this campaign? All invites will also be removed.")) return;
    setDeletingId(campaignId);
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
    if (res.ok) {
      setCampaigns((p) => p.filter((c) => c.id !== campaignId));
      if (selected?.id === campaignId) { setSelected(null); setInvites([]); }
    }
    setDeletingId("");
  }

  async function handlePlayAudio(sessionId: string) {
    if (audioUrls[sessionId]) return; // already fetched
    setAudioLoading((p) => ({ ...p, [sessionId]: true }));
    const res = await fetch(`/api/interview/audio/${sessionId}`);
    const data = await res.json();
    if (res.ok && data.url) {
      setAudioUrls((p) => ({ ...p, [sessionId]: data.url }));
    }
    setAudioLoading((p) => ({ ...p, [sessionId]: false }));
  }

  async function handleTranscript(sessionId: string) {
    if (transcripts[sessionId]) return;
    setTranscriptLoading((p) => ({ ...p, [sessionId]: true }));
    const res = await fetch(`/api/interview/audio/${sessionId}/transcript`);
    const data = await res.json();
    setTranscripts((p) => ({
      ...p,
      [sessionId]: res.ok && data.transcript ? data.transcript : "Transcription failed. Please try again.",
    }));
    setTranscriptLoading((p) => ({ ...p, [sessionId]: false }));
  }

  async function loadSlots(campaignId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/slots`);
    const data = await res.json();
    setSlots(data.slots ?? []);
  }

  async function handleAddSlot() {
    if (!selected || !newSlotDate || !newSlotTime) return;
    setAddingSlot(true);
    const startsAt = new Date(`${newSlotDate}T${newSlotTime}`).toISOString();
    await fetch(`/api/campaigns/${selected.id}/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots: [{ startsAt, durationMin: newSlotDuration }] }),
    });
    setNewSlotDate(""); setNewSlotTime("");
    await loadSlots(selected.id);
    setAddingSlot(false);
  }

  async function handleDeleteSlot(slotId: string) {
    if (!selected) return;
    setDeletingSlotId(slotId);
    await fetch(`/api/campaigns/${selected.id}/slots`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId }),
    });
    setSlots((p) => p.filter((s) => s.id !== slotId));
    setDeletingSlotId("");
  }

  function copyLink(link: string, token: string) {
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(""), 2000);
  }

  function toggleCompare(inviteId: string) {
    setSelectedForCompare((prev) =>
      prev.includes(inviteId)
        ? prev.filter((id) => id !== inviteId)
        : prev.length < 4 ? [...prev, inviteId] : prev
    );
  }

  async function handleImport() {
    if (!selected || !importFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("sendEmail", "true");
    fd.append("companyName", "Our Company");
    const res = await fetch(`/api/campaigns/${selected.id}/import`, { method: "POST", body: fd });
    const data = await res.json();
    setImportResult(data.summary);
    setImporting(false);
    setImportFile(null);
    loadInvites(selected);
  }

  async function loadNotes(inviteId: string) {
    setNotesInviteId(inviteId);
    const res = await fetch(`/api/campaigns/notes/${inviteId}`);
    const data = await res.json();
    setNotes(data.notes ?? []);
  }

  async function handleAddNote() {
    if (!newNote.trim() || !notesInviteId) return;
    setSavingNote(true);
    const res = await fetch(`/api/campaigns/notes/${notesInviteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newNote }),
    });
    const data = await res.json();
    if (res.ok) { setNotes((p) => [data.note, ...p]); setNewNote(""); }
    setSavingNote(false);
  }

  async function handleDeleteNote(noteId: string) {
    if (!notesInviteId) return;
    await fetch(`/api/campaigns/notes/${notesInviteId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    });
    setNotes((p) => p.filter((n) => n.id !== noteId));
  }

  async function handleRetake(inviteId: string) {
    if (!selected || !confirm("Create a new interview link for this candidate?")) return;
    setRetakingId(inviteId);
    const res = await fetch(`/api/campaigns/${selected.id}/retake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId }),
    });
    const data = await res.json();
    if (res.ok) {
      navigator.clipboard.writeText(data.link);
      alert(`New link created and copied!\n${data.link}`);
      loadInvites(selected);
    }
    setRetakingId("");
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
              <div key={c.id} className={`rounded-xl border p-4 transition-all ${selected?.id === c.id ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-accent"}`}>
                <button className="w-full text-left" onClick={() => loadInvites(c)}>
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
                <div className="flex justify-end mt-2 pt-2 border-t border-border/50">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(c.id); }}
                    disabled={deletingId === c.id}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    {deletingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Delete
                  </button>
                </div>
              </div>
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
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)}>
                        <Upload className="h-3.5 w-3.5" /> Import CSV
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowInvite(!showInvite)}>
                        <Mail className="h-3.5 w-3.5" /> Add Candidates
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {showImport && (
                  <CardContent className="space-y-3 pt-0 border-b border-border pb-4">
                    <p className="text-xs text-muted-foreground">Upload a CSV file with columns: <code className="bg-secondary px-1 rounded">email, name</code> (header row optional)</p>
                    <div className="flex gap-2 items-center">
                      <input type="file" accept=".csv,.txt" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                        className="text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-violet-600 file:text-white file:text-xs file:px-2 file:py-1 file:cursor-pointer" />
                      <Button size="sm" onClick={handleImport} disabled={!importFile || importing}>
                        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {importing ? "Importing…" : "Import"}
                      </Button>
                    </div>
                    {importResult && (
                      <p className="text-xs">
                        <span className="text-green-400">✓ {importResult.created} created</span>
                        {importResult.skipped > 0 && <span className="text-yellow-400 ml-2">⚠ {importResult.skipped} skipped</span>}
                        {importResult.errors > 0 && <span className="text-red-400 ml-2">✗ {importResult.errors} errors</span>}
                      </p>
                    )}
                  </CardContent>
                )}
                {showInvite && (
                  <CardContent className="space-y-4 pt-0">
                  <div className="space-y-1.5">
                      <Label>Email Addresses</Label>
                      <div
                        className="min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-violet-500 flex flex-wrap gap-1.5 cursor-text"
                        onClick={() => document.getElementById("email-chip-input")?.focus()}
                      >
                        {emailChips.map((chip, i) => (
                          <span key={i} className="flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 px-2 py-0.5 text-xs font-medium">
                            {chip}
                            <button type="button" onClick={() => removeChip(i)} className="ml-0.5 hover:text-white text-violet-400">×</button>
                          </span>
                        ))}
                        <input
                          id="email-chip-input"
                          type="text"
                          className="flex-1 min-w-[180px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                          placeholder={emailChips.length === 0 ? "user@example.com, user2@example.com" : ""}
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              if (emailInput.trim()) addEmailChip(emailInput);
                            } else if (e.key === "Backspace" && !emailInput && emailChips.length > 0) {
                              removeChip(emailChips.length - 1);
                            }
                          }}
                          onBlur={() => { if (emailInput.trim()) addEmailChip(emailInput); }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const pasted = e.clipboardData.getData("text");
                            addEmailChip(pasted);
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Separate multiple emails with commas. Press Enter or comma to add them to your list.</p>
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
                    <Button onClick={handleInvite} disabled={(emailChips.length === 0 && !emailInput.trim()) || inviting}>
                      {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      {inviting ? "Sending…" : "Send Invites"}
                    </Button>

                    {/* Generated links */}
                    {(inviteResults.length > 0 || inviteErrors.length > 0) && (
                      <div className="space-y-2">
                        {inviteResults.length > 0 && (
                          <>
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
                          </>
                        )}
                        {inviteErrors.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> {inviteErrors.length} skipped
                            </p>
                            {inviteErrors.map((e) => (
                              <div key={e.email} className="flex items-center gap-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20 px-3 py-2">
                                <span className="text-xs text-muted-foreground flex-1 truncate">{e.email}</span>
                                <span className="text-xs text-yellow-500 shrink-0">{e.error}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* ── Slot Management ── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-400" /> Interview Slots
                    </CardTitle>
                    <Button size="sm" variant="outline" onClick={() => {
                      setShowSlots(!showSlots);
                      if (!showSlots && selected) loadSlots(selected.id);
                    }}>
                      <Calendar className="h-3.5 w-3.5" /> {showSlots ? "Hide" : "Manage Slots"}
                    </Button>
                  </div>
                </CardHeader>
                {showSlots && (
                  <CardContent className="space-y-4 pt-0">
                    {/* Add slot form */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Input type="date" value={newSlotDate} onChange={(e) => setNewSlotDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Time</Label>
                        <Input type="time" value={newSlotTime} onChange={(e) => setNewSlotTime(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Duration (min)</Label>
                        <Select value={String(newSlotDuration)} onValueChange={(v) => setNewSlotDuration(Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[15, 20, 30, 45, 60].map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" onClick={handleAddSlot} disabled={!newSlotDate || !newSlotTime || addingSlot} className="h-8">
                        {addingSlot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                      </Button>
                    </div>

                    {/* Slots list */}
                    {slots.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No slots added yet. Add slots above.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {slots.map((slot) => {
                          const appUrl = typeof window !== "undefined" ? window.location.origin : "";
                          const scheduleLink = `${appUrl}/interview/schedule/${selected?.id}`;
                          return (
                            <div key={slot.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${slot.isBooked ? "border-green-500/20 bg-green-500/5" : "border-border"}`}>
                              <Calendar className={`h-3.5 w-3.5 shrink-0 ${slot.isBooked ? "text-green-400" : "text-muted-foreground"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">
                                  {new Date(slot.startsAt).toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{slot.durationMin} min · {slot.isBooked ? "Booked ✓" : "Available"}</p>
                              </div>
                              {!slot.isBooked && (
                                <button onClick={() => handleDeleteSlot(slot.id)} disabled={deletingSlotId === slot.id}
                                  className="text-muted-foreground hover:text-red-400 transition-colors">
                                  {deletingSlotId === slot.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </div>
                          );
                        })}
                        <div className="pt-1">
                          <p className="text-[10px] text-muted-foreground">
                            Share scheduling link with candidates:
                          </p>
                          <p className="text-[10px] text-violet-400 break-all">
                            {typeof window !== "undefined" ? window.location.origin : ""}/interview/schedule/[invite-token]
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Candidates table */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Candidates ({invites.length})</CardTitle>
                    <div className="flex items-center gap-2">
                      {selectedForCompare.length >= 2 && (
                        <a
                          href={`/campaigns/compare?campaign=${selected.id}&ids=${selectedForCompare.join(",")}`}
                          className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-2.5 py-1.5 text-xs font-medium text-white transition-colors"
                        >
                          <GitCompare className="h-3.5 w-3.5" /> Compare ({selectedForCompare.length})
                        </a>
                      )}
                      {invites.length > 0 && selected && (
                        <a href={`/api/campaigns/${selected.id}/export`} download
                          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
                          <Download className="h-3.5 w-3.5" /> Export CSV
                        </a>
                      )}
                    </div>
                  </div>
                  {invites.filter((i) => i.score !== null).length >= 2 && (
                    <p className="text-xs text-muted-foreground">
                      Select 2-4 completed candidates to compare
                    </p>
                  )}
                </CardHeader>
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
                          <div key={inv.id} className="rounded-lg border border-border p-3 space-y-2">
                            {/* Row 1: checkbox + photo + info + badges */}
                            <div className="flex items-center gap-3">
                              {inv.score !== null && (
                                <input type="checkbox" checked={selectedForCompare.includes(inv.id)}
                                  onChange={() => toggleCompare(inv.id)}
                                  disabled={!selectedForCompare.includes(inv.id) && selectedForCompare.length >= 4}
                                  className="h-4 w-4 rounded accent-violet-600 shrink-0 cursor-pointer" />
                              )}
                              <div className="shrink-0">
                                {inv.photoUrl ? (
                                  <img src={inv.photoUrl} alt={inv.name || inv.email}
                                    className="w-16 h-16 rounded-xl object-cover border-2 border-violet-500/40 shadow-md" />
                                ) : (
                                  <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-xl font-bold text-muted-foreground">
                                    {(inv.name || inv.email).charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{inv.name || inv.email}</p>
                                {inv.name && <p className="text-xs text-muted-foreground truncate">{inv.email}</p>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                {inv.score !== null && (
                                  <span className={`text-sm font-bold ${getScoreColor(inv.score)}`}>{inv.score}/100</span>
                                )}
                                {inv.integrityFlag && inv.integrityFlag !== "clean" && (
                                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold border ${inv.integrityFlag === "suspicious" ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"}`}>
                                    {inv.integrityFlag === "suspicious" ? "🚨 Suspicious" : "⚠️ Warning"}
                                  </span>
                                )}
                                {inv.tabSwitchCount > 0 && (
                                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${inv.tabSwitchCount >= 3 ? "bg-red-500/15 border-red-500/40 text-red-400" : "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"}`}>
                                    ⚠️ {inv.tabSwitchCount}x
                                  </span>
                                )}
                                {inv.proctoring && (inv.proctoring.multipleFaces + inv.proctoring.lookingAway + inv.proctoring.copyPaste) > 0 && (
                                  <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border bg-red-500/15 border-red-500/40 text-red-400">
                                    🔍 {inv.proctoring.multipleFaces + inv.proctoring.lookingAway + inv.proctoring.copyPaste}
                                  </span>
                                )}
                                <Badge variant={inv.status === "completed" ? "success" : inv.status === "started" ? "warning" : inv.status === "abandoned" ? "destructive" : "secondary"}>
                                  {inv.status === "completed" ? <CheckCircle className="h-3 w-3 mr-1" /> : inv.status === "abandoned" ? <span className="mr-1">✗</span> : <Clock className="h-3 w-3 mr-1" />}
                                  {inv.status === "abandoned" ? "left midway" : inv.status}
                                </Badge>
                                <button onClick={() => copyLink(link, inv.token)} className="text-muted-foreground hover:text-violet-400 transition-colors">
                                  {copiedToken === inv.token ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                                </button>
                                <button onClick={() => notesInviteId === inv.id ? setNotesInviteId(null) : loadNotes(inv.id)}
                                  title="Notes" className={`transition-colors ${notesInviteId === inv.id ? "text-violet-400" : "text-muted-foreground hover:text-violet-400"}`}>
                                  <StickyNote className="h-3.5 w-3.5" />
                                </button>
                                {inv.status === "completed" && (
                                  <button onClick={() => handleRetake(inv.id)} disabled={retakingId === inv.id}
                                    title="Allow retake" className="text-muted-foreground hover:text-green-400 transition-colors">
                                    {retakingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Audio player */}
                            {inv.hasAudio && inv.sessionId && (
                              <div>
                                {audioUrls[inv.sessionId] ? (
                                  <div className="space-y-1">
                                    <audio controls preload="auto" src={audioUrls[inv.sessionId]} className="w-full h-10" style={{ colorScheme: "dark" }} />
                                    <a href={audioUrls[inv.sessionId]} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:underline">
                                      Open in new tab if player doesn&apos;t work
                                    </a>
                                  </div>
                                ) : (
                                  <button onClick={() => handlePlayAudio(inv.sessionId!)} disabled={audioLoading[inv.sessionId!]}
                                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 border border-violet-500/30 rounded-lg px-3 py-1.5 w-full justify-center">
                                    {audioLoading[inv.sessionId!] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>🎧</span>}
                                    {audioLoading[inv.sessionId!] ? "Loading audio…" : "Play Interview Recording"}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Row 3: Notes panel */}
                            {notesInviteId === inv.id && (
                              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
                                <p className="text-xs font-semibold text-violet-400 flex items-center gap-1.5">
                                  <StickyNote className="h-3.5 w-3.5" /> Recruiter Notes
                                </p>
                                <div className="flex gap-2">
                                  <input type="text" placeholder="Add a private note…" value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                                    className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs outline-none focus:border-violet-500" />
                                  <button onClick={handleAddNote} disabled={savingNote || !newNote.trim()}
                                    className="rounded-lg bg-violet-600 hover:bg-violet-700 px-2 py-1 text-xs text-white disabled:opacity-40">
                                    {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                                  </button>
                                </div>
                                {notes.length > 0 ? (
                                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                    {notes.map((n) => (
                                      <div key={n.id} className="flex items-start gap-2 text-xs">
                                        <p className="flex-1 text-muted-foreground">{n.text}</p>
                                        <button onClick={() => handleDeleteNote(n.id)} className="text-muted-foreground hover:text-red-400 shrink-0">×</button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No notes yet</p>
                                )}
                              </div>
                            )}
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
