"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Stage = "idle" | "uploading" | "analyzing" | "done" | "error";

export default function UploadResumePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [dragging, setDragging] = useState(false);

  const handleFile = (f: File) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(f.type)) {
      setError("Only PDF and DOCX files are supported");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File must be under 5MB");
      return;
    }
    setFile(f);
    setError("");
    setStage("idle");
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setStage("uploading");
    setProgress(20);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/resume/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) throw new Error(uploadData.error);

      setProgress(50);
      setStage("analyzing");

      const analyzeRes = await fetch("/api/resume/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: uploadData.resume.id }),
      });
      const analyzeData = await analyzeRes.json();

      if (!analyzeRes.ok) throw new Error(analyzeData.error);

      setProgress(100);
      setResumeId(uploadData.resume.id);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStage("error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Resume</h1>
        <p className="text-muted-foreground mt-1">Upload your resume for AI-powered analysis and personalized interview prep</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resume File</CardTitle>
          <CardDescription>Supports PDF and DOCX formats, max 5MB</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={onDrop}
            onClick={() => !file && document.getElementById("file-input")?.click()}
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-all ${
              dragging
                ? "border-violet-500 bg-violet-500/10 scale-[1.01]"
                : file
                ? "border-violet-500/50 bg-violet-500/5 cursor-default"
                : "border-border hover:border-violet-500/50 hover:bg-accent/50 cursor-pointer"
            }`}
          >
            <input
              id="file-input"
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {dragging ? (
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/20 border-2 border-violet-500/50">
                  <Upload className="h-8 w-8 text-violet-400 animate-bounce" />
                </div>
                <p className="font-semibold text-violet-400">Drop to upload!</p>
              </div>
            ) : file ? (
              <div className="flex items-center gap-4 w-full max-w-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
                  <FileText className="h-6 w-6 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {file.type.includes("pdf") ? "PDF" : "DOCX"}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setStage("idle"); setError(""); }}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 pointer-events-none">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Drop your resume here</p>
                  <p className="text-sm text-muted-foreground mt-1">or <span className="text-violet-500 underline underline-offset-2">click to browse</span></p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">PDF</span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">DOCX</span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">Max 5MB</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Progress */}
          {(stage === "uploading" || stage === "analyzing") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {stage === "uploading" ? "Uploading file..." : "Analyzing with AI..."}
                </span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {stage === "done" && (
            <div className="flex items-center gap-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-400">Analysis complete!</p>
                <p className="text-xs text-muted-foreground">Your resume has been analyzed successfully</p>
              </div>
              <Button size="sm" onClick={() => router.push(`/resume-report?id=${resumeId}`)}>
                View Report
              </Button>
            </div>
          )}

          {stage !== "done" && (
            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={!file || stage === "uploading" || stage === "analyzing"}
            >
              {(stage === "uploading" || stage === "analyzing") && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {stage === "idle" || stage === "error" ? "Analyze Resume" : "Processing..."}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">Tips for best results</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Use a clean, well-formatted resume without complex tables",
              "Include your skills, experience, and education clearly",
              "PDF format generally gives better text extraction",
              "Make sure your resume is up to date before uploading",
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span className="text-violet-500 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
