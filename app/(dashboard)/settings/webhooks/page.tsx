"use client";
import { useEffect, useState } from "react";
import {
  Plus, Trash2, Loader2, Zap, CheckCircle, X,
  ToggleLeft, ToggleRight, Send, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Webhook {
  id: string;
  name: string;
  type: string;
  url: string;
  events: string[];
  scoreThreshold: number | null;
  isActive: boolean;
  createdAt: string;
}

const WEBHOOK_TYPES = [
  { value: "slack",      label: "Slack",      desc: "Slack Incoming Webhook",     color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "greenhouse", label: "Greenhouse", desc: "ATS Integration",            color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { value: "lever",      label: "Lever",      desc: "ATS Integration",            color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  { value: "workday",    label: "Workday",    desc: "HR System Integration",      color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "custom",     label: "Custom",     desc: "Any HTTP endpoint",          color: "bg-secondary text-muted-foreground border-border" },
];

const EVENTS = [
  { value: "interview_completed",    label: "Interview Completed",     desc: "Fires when candidate submits interview" },
  { value: "candidate_shortlisted",  label: "Candidate Shortlisted",   desc: "Fires when score crosses threshold" },
  { value: "score_threshold_crossed",label: "Score Threshold Crossed", desc: "Fires when score >= your threshold" },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [testingId, setTestingId] = useState("");
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: "", type: "slack", url: "", secret: "",
    events: ["interview_completed"] as string[],
    scoreThreshold: "",
  });

  function load() {
    setLoading(true);
    fetch("/api/webhooks")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setWebhooks(d.webhooks ?? []))
      .catch(() => setWebhooks([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function toggleEvent(ev: string) {
    setForm((p) => ({
      ...p,
      events: p.events.includes(ev) ? p.events.filter((e) => e !== ev) : [...p.events, ev],
    }));
  }

  async function handleAdd() {
    if (!form.name || !form.url || !form.events.length) return;
    setSaving(true);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        scoreThreshold: form.scoreThreshold ? Number(form.scoreThreshold) : null,
      }),
    });
    if (res.ok) {
      setShowAdd(false);
      setForm({ name: "", type: "slack", url: "", secret: "", events: ["interview_completed"], scoreThreshold: "" });
      load();
    }
    setSaving(false);
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setWebhooks((p) => p.map((w) => w.id === id ? { ...w, isActive: !isActive } : w));
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this webhook?")) return;
    setDeletingId(id);
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    setWebhooks((p) => p.filter((w) => w.id !== id));
    setDeletingId("");
  }

  async function handleTest(id: string) {
    setTestingId(id);
    const res = await fetch(`/api/webhooks/${id}`, { method: "POST" });
    const data = await res.json();
    setTestResult((p) => ({ ...p, [id]: res.ok ? "✓ Sent!" : data.error ?? "Failed" }));
    setTestingId("");
    setTimeout(() => setTestResult((p) => { const n = { ...p }; delete n[id]; return n; }), 3000);
  }

  const typeColor = (type: string) => WEBHOOK_TYPES.find((t) => t.value === type)?.color ?? "";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground mt-1">Integrate with Slack, ATS systems, and custom endpoints</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4" /> Add Webhook
        </Button>
      </div>

      {/* ── How it works ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: "🎯", title: "Interview Completed", desc: "Notify Slack or ATS when candidate finishes" },
          { icon: "🏆", title: "Auto-Shortlist", desc: "Trigger when score crosses your threshold" },
          { icon: "🔗", title: "ATS Sync", desc: "Push data to Greenhouse, Lever, Workday" },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border p-4">
            <div className="text-2xl mb-2">{item.icon}</div>
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <Card className="border-violet-500/30">
          <CardHeader><CardTitle className="text-base">New Webhook</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="e.g. Slack #hiring" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEBHOOK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label} — {t.desc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input
                placeholder={form.type === "slack" ? "https://hooks.slack.com/services/..." : "https://your-ats.com/webhook"}
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
              {form.type === "slack" && (
                <p className="text-xs text-muted-foreground">
                  Get URL from: Slack → Apps → Incoming Webhooks →{" "}
                  <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline inline-flex items-center gap-0.5">
                    Setup guide <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Signing Secret (optional)</Label>
                <Input placeholder="For HMAC-SHA256 verification" value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Score Threshold for Auto-Shortlist</Label>
                <Input type="number" min={0} max={100} placeholder="e.g. 75 (leave empty to disable)"
                  value={form.scoreThreshold} onChange={(e) => setForm({ ...form, scoreThreshold: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Trigger Events</Label>
              <div className="space-y-2">
                {EVENTS.map((ev) => (
                  <button key={ev.value} onClick={() => toggleEvent(ev.value)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                      form.events.includes(ev.value) ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-accent"
                    }`}>
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      form.events.includes(ev.value) ? "border-violet-500 bg-violet-500" : "border-border"
                    }`}>
                      {form.events.includes(ev.value) && <CheckCircle className="h-3 w-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{ev.label}</p>
                      <p className="text-xs text-muted-foreground">{ev.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={!form.name || !form.url || !form.events.length || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Save Webhook
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Webhooks list ── */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No webhooks configured</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add a webhook to integrate with Slack or your ATS</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <Card key={wh.id} className={!wh.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{wh.name}</p>
                      <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium capitalize ${typeColor(wh.type)}`}>
                        {wh.type}
                      </span>
                      {!wh.isActive && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                      {wh.scoreThreshold && (
                        <span className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5">
                          Shortlist ≥{wh.scoreThreshold}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{wh.url}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {wh.events.map((ev) => (
                        <span key={ev} className="text-[10px] bg-secondary rounded px-1.5 py-0.5">
                          {ev.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Test */}
                    <button onClick={() => handleTest(wh.id)} disabled={testingId === wh.id || !wh.isActive}
                      title="Send test payload"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-violet-400 transition-colors px-2 py-1 rounded border border-border hover:bg-accent">
                      {testingId === wh.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {testResult[wh.id] ?? "Test"}
                    </button>
                    {/* Toggle */}
                    <button onClick={() => handleToggle(wh.id, wh.isActive)}
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      {wh.isActive
                        ? <ToggleRight className="h-5 w-5 text-violet-400" />
                        : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    {/* Delete */}
                    <button onClick={() => handleDelete(wh.id)} disabled={deletingId === wh.id}
                      className="text-muted-foreground hover:text-red-400 transition-colors">
                      {deletingId === wh.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Payload reference ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Payload Reference</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-4 overflow-x-auto">{`{
  "event": "interview_completed",
  "timestamp": "2026-04-15T10:30:00Z",
  "data": {
    "candidateName": "Rahul Sharma",
    "candidateEmail": "rahul@example.com",
    "role": "Senior Node.js Developer",
    "campaignTitle": "Backend Batch 1",
    "overallScore": 85,
    "technicalScore": 80,
    "communicationScore": 90,
    "confidenceScore": 85,
    "tabSwitchCount": 0,
    "passed": true,
    "shortlisted": true,
    "dashboardUrl": "https://yourapp.com/campaigns"
  }
}`}</pre>
          <p className="text-xs text-muted-foreground mt-2">
            Signature header: <code className="bg-secondary px-1 rounded">X-Webhook-Signature: sha256=...</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
