"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Briefcase, Plus, Zap, Trophy, AlertCircle, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, Sparkles, Mail, Webhook, Users,
  Settings2, Upload, FileText, X, FolderArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────
interface JobDescription {
  id: string; title: string; company?: string;
  description: string; createdAt: string;
  _count: { matches: number };
}
interface RankedCandidate {
  rank: number; resumeId: string; fileName: string; score: number;
  matchedSkills: string[]; missingSkills: string[];
  summary: string;
  recommendation: "strong_match" | "good_match" | "partial_match" | "weak_match";
}
interface Campaign { id: string; title: string; role: string; }
interface ShortlistSummary {
  shortlisted: number; emailsSent: number;
  campaignInvites: number; webhooksFired: number;
  candidates: { resumeId: string; fileName: string; score: number; email: string | null; emailSent: boolean }[];
}
interface UploadedFile { file: File; status: "pending" | "done" | "error"; error?: string; }

const BADGE: Record<string, { label: string; cls: string }> = {
  strong_match:  { label: "Strong Match",  cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  good_match:    { label: "Good Match",    cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  partial_match: { label: "Partial Match", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  weak_match:    { label: "Weak Match",    cls: "bg-red-500/20 text-red-400 border-red-500/30" },
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "#22c55e" : score >= 65 ? "#3b82f6" : score >= 40 ? "#eab308" : "#ef4444";
  const r = 28, circ = 2 * Math.PI * r, dash = (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      <svg className="absolute" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-border" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 32 32)" />
      </svg>
      <span className="text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Bulk Upload Zone ─────────────────────────────────────────────
function BulkUploadZone({
  selectedJd,
  onUploadComplete,
}: {
  selectedJd: JobDescription | null;
  onUploadComplete: () => void;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ uploaded: number; failed: number; matched: boolean } | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const next: UploadedFile[] = incoming
      .filter((f) => allowed.includes(f.type) || f.name.endsWith(".zip"))
      .map((f) => ({ file: f, status: "pending" as const }));
    setFiles((prev) => {
      const names = new Set(prev.map((p) => p.file.name));
      return [...prev, ...next.filter((n) => !names.has(n.file.name))];
    });
    setError("");
    setSummary(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true); setProgress(10); setError(""); setSummary(null);

    const fd = new FormData();
    const zipFiles = files.filter((f) => f.file.name.endsWith(".zip"));
    const directFiles = files.filter((f) => !f.file.name.endsWith(".zip"));

    directFiles.forEach((f) => fd.append("files", f.file));
    if (zipFiles.length > 0) fd.append("zip", zipFiles[0].file);
    if (selectedJd) fd.append("jobDescriptionId", selectedJd.id);

    setProgress(30);
    const res = await fetch("/api/resume/bulk-upload", { method: "POST", body: fd });
    const data = await res.json();
    setProgress(100);
    setUploading(false);

    if (!res.ok) { setError(data.error ?? "Upload failed"); return; }

    setFiles((prev) => prev.map((f) => ({ ...f, status: "done" as const })));
    setSummary({ uploaded: data.uploaded, failed: data.failed, matched: data.matched });
    if (data.uploaded > 0) onUploadComplete();
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-6 transition-all text-center cursor-pointer ${
          dragging ? "border-violet-500 bg-violet-500/10" : "border-border hover:border-violet-500/50 hover:bg-accent/30"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx" className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
        <input ref={zipRef} type="file" accept=".zip" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) addFiles([e.target.files[0]]); }} />

        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
            <Upload className="h-6 w-6 text-violet-400" />
          </div>
          <p className="text-sm font-medium">Drop resumes here or click to browse</p>
          <p className="text-xs text-muted-foreground">PDF, DOCX — multiple files supported</p>
          <div className="flex gap-2 mt-1">
            {["PDF", "DOCX", "Up to 50 files"].map((t) => (
              <span key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ZIP button */}
      <button
        onClick={(e) => { e.stopPropagation(); zipRef.current?.click(); }}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-violet-500/50 hover:text-violet-400 transition-colors"
      >
        <FolderArchive className="h-3.5 w-3.5" /> Upload ZIP file (bulk)
      </button>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
              <FileText className="h-3.5 w-3.5 text-violet-400 shrink-0" />
              <span className="text-xs flex-1 truncate">{f.file.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {(f.file.size / 1024).toFixed(0)}KB
              </span>
              {f.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />}
              {f.status === "error" && <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
              {f.status === "pending" && !uploading && (
                <button onClick={(e) => { e.stopPropagation(); setFiles((p) => p.filter((_, j) => j !== i)); }}
                  className="text-muted-foreground hover:text-red-400 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {/* Progress bar */}
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />
              {progress < 50 ? "Uploading & extracting text..." : "AI matching resumes..."}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs space-y-0.5">
          <p className="text-green-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Upload complete
          </p>
          <p className="text-muted-foreground">
            {summary.uploaded} uploaded{summary.failed > 0 ? `, ${summary.failed} failed` : ""}
            {summary.matched ? " · AI matching done" : ""}
          </p>
        </div>
      )}

      {files.length > 0 && !uploading && summary === null && (
        <Button onClick={handleUpload} className="w-full gap-2" disabled={uploading}>
          <Zap className="h-4 w-4" />
          Upload & {selectedJd ? "Match Against JD" : "Save"} ({files.filter(f => f.status === "pending").length} files)
        </Button>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function JobMatchPage() {
  const [jds, setJds] = useState<JobDescription[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", company: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [selectedJd, setSelectedJd] = useState<JobDescription | null>(null);
  const [ranked, setRanked] = useState<RankedCandidate[]>([]);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-shortlist
  const [showShortlist, setShowShortlist] = useState(false);
  const [threshold, setThreshold] = useState(65);
  const [companyName, setCompanyName] = useState("");
  const [sendEmails, setSendEmails] = useState(true);
  const [fireWebhooks, setFireWebhooks] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [shortlisting, setShortlisting] = useState(false);
  const [shortlistResult, setShortlistResult] = useState<ShortlistSummary | null>(null);
  const [shortlistError, setShortlistError] = useState("");

  // Active tab: "upload" | "results"
  const [tab, setTab] = useState<"upload" | "results">("upload");

  const fetchJds = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/job-match");
    const data = await res.json();
    setJds(data.jobDescriptions ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchJds();
    fetch("/api/campaigns").then((r) => r.json()).then((d) => setCampaigns(d.campaigns ?? []));
  }, [fetchJds]);

  async function createJD() {
    setFormError("");
    if (!form.title.trim() || !form.description.trim()) { setFormError("Title and description are required."); return; }
    setCreating(true);
    const res = await fetch("/api/job-match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setFormError(data.error ?? "Failed to create"); return; }
    setForm({ title: "", company: "", description: "" });
    setShowForm(false);
    fetchJds();
  }

  async function runMatch(jd: JobDescription) {
    setSelectedJd(jd); setRanked([]); setMatchError(""); setShortlistResult(null);
    setMatching(true); setTab("results");
    const res = await fetch(`/api/job-match/${jd.id}/match`, { method: "POST" });
    const data = await res.json();
    setMatching(false);
    if (!res.ok) { setMatchError(data.error ?? "Matching failed"); return; }
    setRanked(data.ranked ?? []);
    fetchJds();
  }

  async function loadResults(jd: JobDescription) {
    setSelectedJd(jd); setRanked([]); setMatchError(""); setShortlistResult(null);
    setMatching(true); setTab("results");
    const res = await fetch(`/api/job-match/${jd.id}/results`);
    const data = await res.json();
    setMatching(false);
    if (!res.ok) { setMatchError(data.error ?? "Failed to load"); return; }
    setRanked(data.ranked ?? []);
  }

  async function runAutoShortlist() {
    if (!selectedJd) return;
    setShortlisting(true); setShortlistResult(null); setShortlistError("");
    const res = await fetch(`/api/job-match/${selectedJd.id}/auto-shortlist`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threshold, companyName: companyName || selectedJd.company || "Our Company",
        sendEmails, fireWebhooks, campaignId: selectedCampaignId || undefined,
      }),
    });
    const data = await res.json();
    setShortlisting(false);
    if (!res.ok) { setShortlistError(data.error ?? "Auto-shortlist failed"); return; }
    setShortlistResult(data);
  }

  const aboveThreshold = ranked.filter((c) => c.score >= threshold).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-violet-500" /> Job Match
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Bulk upload resumes → AI ranks candidates → auto-shortlist the best.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" /> New JD
        </Button>
      </div>

      {/* Create JD form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Add Job Description</h2>
          {formError && <p className="text-red-400 text-sm flex items-center gap-1"><AlertCircle className="h-4 w-4" />{formError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Job Title *</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. Senior React Developer" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Company (optional)</label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. Acme Corp" value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Job Description *</label>
            <textarea rows={5} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              placeholder="Paste the full job description here..." value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createJD} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: JD list */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Job Descriptions ({jds.length})
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : jds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
              Create a JD first, then upload resumes.
            </div>
          ) : (
            jds.map((jd) => (
              <div key={jd.id}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${selectedJd?.id === jd.id ? "border-violet-500 bg-violet-500/5" : "border-border bg-card hover:border-violet-500/40"}`}
                onClick={() => { setSelectedJd(jd); setTab("upload"); }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{jd.title}</p>
                    {jd.company && <p className="text-xs text-muted-foreground">{jd.company}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {jd._count.matches} resume{jd._count.matches !== 1 ? "s" : ""} analyzed
                    </p>
                  </div>
                  {jd._count.matches > 0 && (
                    <Button size="sm" variant="ghost"
                      onClick={(e) => { e.stopPropagation(); loadResults(jd); }}
                      className="gap-1 shrink-0 text-xs h-7 px-2">
                      <Zap className="h-3 w-3" /> Results
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: Upload + Results (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedJd ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
              Select a job description to upload resumes and view rankings.
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
                {(["upload", "results"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {t === "upload" ? "Upload Resumes" : `Rankings${ranked.length > 0 ? ` (${ranked.length})` : ""}`}
                  </button>
                ))}
              </div>

              {/* Upload tab */}
              {tab === "upload" && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">Bulk Resume Upload</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Uploading for: <span className="text-violet-400">{selectedJd.title}</span>
                      </p>
                    </div>
                    {selectedJd._count.matches > 0 && (
                      <Button size="sm" onClick={() => runMatch(selectedJd)} disabled={matching} className="gap-1 text-xs">
                        {matching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        Re-run AI Match
                      </Button>
                    )}
                  </div>
                  <BulkUploadZone
                    selectedJd={selectedJd}
                    onUploadComplete={() => { fetchJds(); loadResults(selectedJd); }}
                  />
                </div>
              )}

              {/* Results tab */}
              {tab === "results" && (
                <div className="space-y-3">
                  {matching && (
                    <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3 text-muted-foreground text-sm">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                      <p>AI is analyzing resumes...</p>
                    </div>
                  )}
                  {matchError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {matchError}
                    </div>
                  )}

                  {/* Auto-Shortlist Panel */}
                  {!matching && ranked.length > 0 && (
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden">
                      <button className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-violet-400 hover:bg-violet-500/10 transition-colors"
                        onClick={() => setShowShortlist(!showShortlist)}>
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Auto-Shortlist Pipeline
                          <span className="text-xs font-normal bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">
                            {aboveThreshold} qualify at {threshold}+
                          </span>
                        </span>
                        {showShortlist ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {showShortlist && (
                        <div className="px-4 pb-4 space-y-3 border-t border-violet-500/20">
                          <div className="pt-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Settings2 className="h-3 w-3" /> Score Threshold
                              </label>
                              <span className="text-sm font-bold text-violet-400">{threshold}+</span>
                            </div>
                            <input type="range" min={40} max={95} step={5} value={threshold}
                              onChange={(e) => setThreshold(Number(e.target.value))}
                              className="w-full accent-violet-500" />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>40 Partial</span><span>65 Good</span><span>85 Strong</span>
                            </div>
                          </div>
                          <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder={selectedJd.company || "Company name for email"}
                            value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                              <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Send shortlist email to candidates
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                              <input type="checkbox" checked={fireWebhooks} onChange={(e) => setFireWebhooks(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                              <Webhook className="h-3.5 w-3.5 text-muted-foreground" /> Fire webhooks (Slack / ATS)
                            </label>
                          </div>
                          {campaigns.length > 0 && (
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" /> Add to Campaign (optional)
                              </label>
                              <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
                                <option value="">— None —</option>
                                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.role})</option>)}
                              </select>
                            </div>
                          )}
                          {shortlistError && <p className="text-red-400 text-sm flex items-center gap-1"><AlertCircle className="h-4 w-4" />{shortlistError}</p>}
                          <Button onClick={runAutoShortlist} disabled={shortlisting || aboveThreshold === 0} className="w-full gap-2 bg-violet-600 hover:bg-violet-700">
                            {shortlisting ? <><Loader2 className="h-4 w-4 animate-spin" /> Running...</> : <><Sparkles className="h-4 w-4" /> Shortlist {aboveThreshold} Candidate{aboveThreshold !== 1 ? "s" : ""}</>}
                          </Button>
                          {shortlistResult && (
                            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2">
                              <p className="text-green-400 text-sm font-semibold flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Pipeline Complete</p>
                              <div className="grid grid-cols-4 gap-2 text-xs text-center">
                                {[
                                  { val: shortlistResult.shortlisted, label: "Shortlisted", color: "text-green-400" },
                                  { val: shortlistResult.emailsSent, label: "Emails", color: "text-blue-400" },
                                  { val: shortlistResult.campaignInvites, label: "Invites", color: "text-violet-400" },
                                  { val: shortlistResult.webhooksFired, label: "Webhooks", color: "text-orange-400" },
                                ].map((s) => (
                                  <div key={s.label} className="bg-background/50 rounded-lg p-2">
                                    <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
                                    <div className="text-muted-foreground text-[10px]">{s.label}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ranked list */}
                  {!matching && ranked.length === 0 && !matchError && (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                      Upload resumes and click "Re-run AI Match" to see rankings.
                    </div>
                  )}

                  {!matching && ranked.map((c) => {
                    const badge = BADGE[c.recommendation] ?? BADGE.weak_match;
                    const isExpanded = expandedId === c.resumeId;
                    const isAbove = c.score >= threshold;
                    return (
                      <div key={c.resumeId} className={`rounded-xl border overflow-hidden transition-all ${isAbove ? "border-border bg-card" : "border-border/40 bg-card/50 opacity-60"}`}>
                        <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : c.resumeId)}>
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${c.rank === 1 ? "bg-yellow-500/20 text-yellow-400" : c.rank === 2 ? "bg-slate-400/20 text-slate-400" : c.rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-muted text-muted-foreground"}`}>
                            {c.rank === 1 ? <Trophy className="h-3.5 w-3.5" /> : c.rank}
                          </div>
                          <ScoreRing score={c.score} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{c.fileName}</p>
                              {isAbove && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30 shrink-0">AUTO</span>}
                            </div>
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mt-1 ${badge.cls}`}>{badge.label}</span>
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                            <p className="text-sm text-muted-foreground">{c.summary}</p>
                            {c.matchedSkills.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-green-400 flex items-center gap-1 mb-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Matched Skills</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {c.matchedSkills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{s}</span>)}
                                </div>
                              </div>
                            )}
                            {c.missingSkills.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-red-400 flex items-center gap-1 mb-1.5"><XCircle className="h-3.5 w-3.5" /> Missing Skills</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {c.missingSkills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
