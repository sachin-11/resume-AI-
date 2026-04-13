"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Resume {
  id: string;
  fileName: string;
}

export default function InterviewSetupPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    resumeId: "",
    role: "",
    difficulty: "intermediate",
    roundType: "technical",
    questionCount: 5,
  });

  useEffect(() => {
    fetch("/api/resume/list")
      .then((r) => r.json())
      .then((d) => setResumes(d.resumes ?? []));
  }, []);

  async function handleStart() {
    if (!form.role) return;
    setLoading(true);

    const res = await fetch("/api/interview/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        resumeId: form.resumeId === "none" || !form.resumeId ? undefined : form.resumeId,
        questionCount: Number(form.questionCount),
      }),
    });

    const data = await res.json();
    if (res.ok) {
      router.push(`/interview/session/${data.session.id}`);
    } else {
      setLoading(false);
    }
  }

  const roundTypes = [
    { value: "technical", label: "Technical Round", desc: "Coding, algorithms, tech concepts" },
    { value: "hr", label: "HR Round", desc: "Culture fit, motivation, goals" },
    { value: "behavioral", label: "Behavioral Round", desc: "STAR method, past experiences" },
    { value: "system_design", label: "System Design", desc: "Architecture, scalability" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Setup Interview</h1>
        <p className="text-muted-foreground mt-1">Configure your mock interview session</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Interview Configuration</CardTitle>
          <CardDescription>Customize your practice session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Role */}
          <div className="space-y-2">
            <Label>Target Role *</Label>
            <Input
              placeholder="e.g. Senior Frontend Developer"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            />
          </div>

          {/* Resume */}
          {resumes.length > 0 && (
            <div className="space-y-2">
              <Label>Resume (optional)</Label>
              <Select value={form.resumeId} onValueChange={(v) => setForm({ ...form, resumeId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a resume for personalized questions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No resume (generic questions)</SelectItem>
                  {resumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.fileName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Round Type */}
          <div className="space-y-2">
            <Label>Round Type</Label>
            <div className="grid grid-cols-2 gap-3">
              {roundTypes.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setForm({ ...form, roundType: value })}
                  className={`text-left rounded-lg border p-3 transition-all ${
                    form.roundType === value
                      ? "border-violet-500 bg-violet-500/5"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="space-y-2">
            <Label>Difficulty Level</Label>
            <div className="flex gap-3">
              {["beginner", "intermediate", "advanced"].map((d) => (
                <button
                  key={d}
                  onClick={() => setForm({ ...form, difficulty: d })}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-all ${
                    form.difficulty === d
                      ? d === "beginner" ? "border-green-500 bg-green-500/10 text-green-400"
                        : d === "intermediate" ? "border-yellow-500 bg-yellow-500/10 text-yellow-400"
                        : "border-red-500 bg-red-500/10 text-red-400"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Question Count */}
          <div className="space-y-2">
            <Label>Number of Questions ({form.questionCount})</Label>
            <input
              type="range"
              min={3}
              max={15}
              value={form.questionCount}
              onChange={(e) => setForm({ ...form, questionCount: Number(e.target.value) })}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>3 (Quick)</span>
              <span>15 (Full)</span>
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleStart}
            disabled={!form.role || loading}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Generating Questions...</>
            ) : (
              <><MessageSquare className="h-4 w-4" />Start Interview</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
