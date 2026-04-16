"use client";
import { useEffect, useState } from "react";
import {
  Plus, Trash2, Loader2, Search, BookOpen,
  Code2, Users, Brain, Layers, ChevronDown, ChevronUp, Pencil, Check, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BankQuestion {
  id: string;
  text: string;
  category: string;
  difficulty: string;
  tags: string[];
  createdAt: string;
}

const CATEGORIES = [
  { value: "all",           label: "All",           icon: <Layers className="h-3.5 w-3.5" /> },
  { value: "technical",     label: "Technical",     icon: <Code2 className="h-3.5 w-3.5" /> },
  { value: "dsa",           label: "DSA",           icon: <Brain className="h-3.5 w-3.5" /> },
  { value: "system_design", label: "System Design", icon: <Layers className="h-3.5 w-3.5" /> },
  { value: "hr",            label: "HR",            icon: <Users className="h-3.5 w-3.5" /> },
  { value: "behavioral",    label: "Behavioral",    icon: <Users className="h-3.5 w-3.5" /> },
];

const DIFF_COLOR: Record<string, string> = {
  beginner:     "bg-green-500/15 text-green-400 border-green-500/30",
  intermediate: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  advanced:     "bg-red-500/15 text-red-400 border-red-500/30",
};

const CAT_COLOR: Record<string, string> = {
  technical:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  dsa:           "bg-violet-500/15 text-violet-400 border-violet-500/30",
  system_design: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  hr:            "bg-pink-500/15 text-pink-400 border-pink-500/30",
  behavioral:    "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    text: "", category: "technical", difficulty: "intermediate", tags: "",
  });
  const [editForm, setEditForm] = useState({ text: "", category: "", difficulty: "", tags: "" });

  function load(cat = activeCategory, q = search) {
    setLoading(true);
    const params = new URLSearchParams();
    if (cat !== "all") params.set("category", cat);
    if (q) params.set("search", q);
    fetch(`/api/question-bank?${params}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function handleCategoryChange(cat: string) {
    setActiveCategory(cat);
    load(cat, search);
  }

  function handleSearch(q: string) {
    setSearch(q);
    load(activeCategory, q);
  }

  async function handleAdd() {
    if (!form.text.trim()) return;
    setSaving(true);
    const res = await fetch("/api/question-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: form.text,
        category: form.category,
        difficulty: form.difficulty,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    if (res.ok) {
      setForm({ text: "", category: "technical", difficulty: "intermediate", tags: "" });
      setShowAdd(false);
      load();
    }
    setSaving(false);
  }

  async function handleEdit(id: string) {
    setSaving(true);
    await fetch(`/api/question-bank/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: editForm.text,
        category: editForm.category,
        difficulty: editForm.difficulty,
        tags: editForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    setEditingId(null);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question?")) return;
    setDeletingId(id);
    await fetch(`/api/question-bank/${id}`, { method: "DELETE" });
    setQuestions((p) => p.filter((q) => q.id !== id));
    setDeletingId("");
  }

  const filtered = questions; // already filtered server-side

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Question Bank</h1>
          <p className="text-muted-foreground mt-1">Custom questions for your interviews</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4" /> Add Question
        </Button>
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <Card className="border-violet-500/30">
          <CardHeader><CardTitle className="text-base">New Question</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Question Text *</Label>
              <Textarea
                placeholder="e.g. Explain the difference between var, let, and const in JavaScript."
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
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
                <Label>Tags (comma separated)</Label>
                <Input placeholder="react, hooks, state" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={!form.text.trim() || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Save Question
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {CATEGORIES.map((c) => (
          <button key={c.value} onClick={() => handleCategoryChange(c.value)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              activeCategory === c.value
                ? "border-violet-500 bg-violet-500/10 text-violet-400"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}>
            {c.icon}{c.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search questions…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-8 text-xs w-48"
          />
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{filtered.length} questions</span>
        {Object.entries(
          filtered.reduce((acc, q) => { acc[q.category] = (acc[q.category] ?? 0) + 1; return acc; }, {} as Record<string, number>)
        ).map(([cat, count]) => (
          <span key={cat} className={`text-xs border rounded-full px-2 py-0.5 ${CAT_COLOR[cat] ?? ""}`}>{cat}: {count}</span>
        ))}
      </div>

      {/* ── Questions list ── */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No questions yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add custom questions to use in your interviews</p>
          <Button size="sm" className="mt-4" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" /> Add First Question
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <Card key={q.id} className="group">
              <CardContent className="p-4">
                {editingId === q.id ? (
                  // ── Edit mode ──
                  <div className="space-y-3">
                    <Textarea
                      value={editForm.text}
                      onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                      className="min-h-[70px] text-sm"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={editForm.difficulty} onValueChange={(v) => setEditForm({ ...editForm, difficulty: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                        placeholder="tags" className="h-7 text-xs" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleEdit(q.id)} disabled={saving}>
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // ── View mode ──
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">{q.text}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${CAT_COLOR[q.category] ?? ""}`}>
                          {q.category}
                        </span>
                        <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${DIFF_COLOR[q.difficulty] ?? ""}`}>
                          {q.difficulty}
                        </span>
                        {q.tags.map((t) => (
                          <span key={t} className="text-[10px] bg-secondary rounded px-1.5 py-0.5">{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(q.id); setEditForm({ text: q.text, category: q.category, difficulty: q.difficulty, tags: q.tags.join(", ") }); }}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(q.id)} disabled={deletingId === q.id}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-red-400 transition-colors">
                        {deletingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
