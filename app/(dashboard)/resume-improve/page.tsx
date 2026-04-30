"use client";
import { useState, useEffect } from "react";
import {
  Wand2, Loader2, AlertCircle, Zap, RefreshCw,
  GitBranch, ArrowRight, ChevronDown, ChevronUp,
  Copy, Check, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────
interface Resume { id: string; fileName: string; }

interface ImprovedBullet {
  section: string;
  company: string;
  original: string;
  improved: string;
  reason: string;
}

interface PriorityFix {
  section: string;
  issue: string;
  fix: string;
}

interface ImprovementReport {
  resumeId: string;
  initialScore: number;
  finalScore: number;
  scoreImprovement: number;
  iterations: number;
  improvedSummary: string;
  improvedBullets: ImprovedBullet[];
  keywordsAdded: string[];
  titleSuggestion: string;
  strengths: string[];
  missingSkills: string[];
  priorityFixes: PriorityFix[];
  quickWins: string[];
  logs: string[];
  status: string;
}

// ── Helpers ──────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors">
      {copied ? <><Check className="h-3 w-3 text-green-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
    </button>
  );
}

function ScoreDiff({ initial, final }: { initial: number; final: number }) {
  const diff = final - initial;
  const color = final >= 70 ? "#22c55e" : final >= 50 ? "#eab308" : "#ef4444";
  const r = 40, circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6 p-5 rounded-xl border border-border bg-card">
      {/* Before */}
      <div className="text-center">
        <div className="text-3xl font-black text-muted-foreground">{initial}</div>
        <div className="text-xs text-muted-foreground mt-1">Before</div>
      </div>

      <ArrowRight className="h-5 w-5 text-muted-foreground" />

      {/* After — score ring */}
      <div className="relative flex items-center justify-center w-24 h-24">
        <svg className="absolute" width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
          <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${(final / 100) * circ} ${circ}`}
            strokeLinecap="round" transform="rotate(-90 48 48)" />
        </svg>
        <div className="text-center">
          <div className="text-2xl font-black" style={{ color }}>{final}</div>
          <div className="text-[10px] text-muted-foreground">After</div>
        </div>
      </div>

      {/* Improvement */}
      <div className="flex-1">
        <div className={`text-2xl font-black ${diff > 0 ? "text-green-400" : "text-muted-foreground"}`}>
          {diff > 0 ? `+${diff}` : diff}
        </div>
        <div className="text-xs text-muted-foreground">ATS Score</div>
        <div className="text-xs text-muted-foreground mt-1">
          {final >= 70 ? "✅ Good for ATS" : final >= 50 ? "⚠️ Needs work" : "❌ Low score"}
        </div>
      </div>
    </div>
  );
}

// ── Agent Log Viewer ─────────────────────────────────────────────
function AgentLogs({ logs }: { logs: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-muted-foreground hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5" /> Agent Execution Log ({logs.length} steps)
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="border-t border-border bg-secondary/20 p-4 space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0 font-mono">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-muted-foreground">{log}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Download Improved Resume as PDF ─────────────────────────────
function downloadImprovedResume(
  report: ImprovementReport,
  originalText: string,
  fileName: string
) {
  // Build improved resume text by replacing original parts with improved ones
  let resumeText = originalText;

  // Replace summary if improved
  if (report.improvedSummary) {
    // Try to find and replace existing summary section
    const summaryPatterns = [
      /SUMMARY[\s\S]*?(?=\n[A-Z]{2,}|\n\n[A-Z])/i,
      /PROFESSIONAL SUMMARY[\s\S]*?(?=\n[A-Z]{2,}|\n\n[A-Z])/i,
      /OBJECTIVE[\s\S]*?(?=\n[A-Z]{2,}|\n\n[A-Z])/i,
      /PROFILE[\s\S]*?(?=\n[A-Z]{2,}|\n\n[A-Z])/i,
    ];
    let replaced = false;
    for (const pattern of summaryPatterns) {
      if (pattern.test(resumeText)) {
        resumeText = resumeText.replace(pattern, `PROFESSIONAL SUMMARY\n${report.improvedSummary}\n\n`);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      // Prepend summary at top
      resumeText = `PROFESSIONAL SUMMARY\n${report.improvedSummary}\n\n` + resumeText;
    }
  }

  // Replace original bullets with improved ones
  for (const bullet of report.improvedBullets) {
    if (bullet.original && bullet.improved) {
      resumeText = resumeText.replace(bullet.original, bullet.improved);
    }
  }

  // Now generate PDF using jsPDF
  import("jspdf").then(({ jsPDF }) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = margin;

    // ── Header bar ───────────────────────────────────────────────
    doc.setFillColor(124, 58, 237); // violet
    doc.rect(0, 0, pageW, 10, "F");

    // ── AI Improved badge ────────────────────────────────────────
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("✦ AI IMPROVED RESUME", margin, 6.5);
    doc.text(`ATS Score: ${report.finalScore}/100`, pageW - margin, 6.5, { align: "right" });

    y = 18;

    // ── Helper: add text with word wrap + page break ─────────────
    function addText(
      text: string,
      fontSize: number,
      color: [number, number, number],
      bold = false,
      indent = 0
    ) {
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, contentW - indent);
      for (const line of lines) {
        if (y > pageH - margin) {
          doc.addPage();
          // Re-add header on new page
          doc.setFillColor(124, 58, 237);
          doc.rect(0, 0, pageW, 10, "F");
          y = 18;
        }
        doc.text(line, margin + indent, y);
        y += fontSize * 0.45;
      }
    }

    function addSectionHeader(title: string) {
      y += 4;
      if (y > pageH - margin) { doc.addPage(); y = 18; }
      doc.setFillColor(245, 243, 255);
      doc.rect(margin - 2, y - 4, contentW + 4, 7, "F");
      doc.setDrawColor(124, 58, 237);
      doc.setLineWidth(0.5);
      doc.line(margin - 2, y - 4, margin - 2, y + 3);
      addText(title.toUpperCase(), 9, [124, 58, 237], true);
      y += 2;
    }

    function addBullet(text: string) {
      if (y > pageH - margin) { doc.addPage(); y = 18; }
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      doc.text("•", margin + 2, y);
      const lines = doc.splitTextToSize(text, contentW - 8);
      for (const line of lines) {
        if (y > pageH - margin) { doc.addPage(); y = 18; }
        doc.text(line, margin + 7, y);
        y += 4.5;
      }
    }

    // ── Parse and render resume sections ────────────────────────
    const lines = resumeText.split("\n");
    let inSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { y += 2; continue; }

      // Detect section headers (ALL CAPS lines)
      const isHeader = /^[A-Z][A-Z\s&/]{3,}$/.test(line) && line.length < 50;
      const isBullet = line.startsWith("•") || line.startsWith("-") || line.startsWith("*");
      const isSubHeader = line.endsWith(":") && line.length < 60;

      if (isHeader) {
        addSectionHeader(line);
        inSection = true;
      } else if (isBullet) {
        addBullet(line.replace(/^[•\-*]\s*/, ""));
      } else if (isSubHeader) {
        addText(line, 9.5, [30, 30, 30], true);
        y += 1;
      } else if (inSection) {
        addText(line, 9, [60, 60, 60]);
      } else {
        // Could be name/contact at top
        const isName = i < 5 && line.length < 50 && !/[@.]/.test(line);
        if (isName) {
          addText(line, 16, [20, 20, 20], true);
          y += 2;
        } else {
          addText(line, 8.5, [80, 80, 80]);
        }
      }
    }

    // ── Footer ───────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Improved by AI Resume Coach • ATS Score: ${report.finalScore}/100 • Page ${p}/${totalPages}`,
        pageW / 2, pageH - 6, { align: "center" }
      );
    }

    // ── Save ─────────────────────────────────────────────────────
    const baseName = fileName.replace(/\.[^.]+$/, "");
    doc.save(`${baseName}_AI_Improved.pdf`);
  });
}

// ── Main Page ────────────────────────────────────────────────────
export default function ResumeImprovePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ImprovementReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [agentDown, setAgentDown] = useState(false);
  const [expandedBullet, setExpandedBullet] = useState<number | null>(null);
  const [step, setStep] = useState("");
  // Track original resume for download
  const [originalText, setOriginalText] = useState("");
  const [originalFileName, setOriginalFileName] = useState("");

  useEffect(() => {
    fetch("/api/resume/list")
      .then((r) => r.json())
      .then((d) => {
        setResumes(d.resumes ?? []);
        if (d.resumes?.length > 0) setSelectedId(d.resumes[0].id);
      });
  }, []);

  async function runAgent() {
    if (!selectedId) return;
    setLoading(true); setError(""); setReport(null); setLogs([]); setAgentDown(false);

    // Store original resume info for download
    const selectedResume = resumes.find((r) => r.id === selectedId);
    setOriginalFileName(selectedResume?.fileName ?? "resume");

    const steps = [
      "🔍 Analyzing resume...",
      "🎯 Identifying gaps...",
      "✍️ Rewriting sections...",
      "📊 Scoring improvements...",
      "🎉 Finalizing report...",
    ];

    let stepIdx = 0;
    setStep(steps[0]);
    const interval = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setStep(steps[stepIdx]);
    }, 8000);

    const res = await fetch("/api/resume/improve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeId: selectedId, targetRole, jobDescription }),
    });

    clearInterval(interval);
    setLoading(false); setStep("");

    const data = await res.json();

    if (!res.ok) {
      if (data.agentDown || data.agentNotConfigured) {
        setAgentDown(true);
        setError(data.error);
      } else {
        setError(data.error ?? "Agent failed");
      }
      return;
    }

    setReport(data.report);
    setLogs(data.logs ?? []);
    // Store original text for PDF generation
    setOriginalText(data.originalText ?? "");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-violet-500" /> Resume Improvement Agent
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          LangGraph AI agent iteratively rewrites your resume until ATS score reaches 70+
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
        <p className="text-xs font-semibold text-violet-400 mb-3 flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" /> How the LangGraph Agent Works
        </p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          {["Analyze", "Identify Gaps", "Rewrite", "Re-Score", "Loop if needed", "Finalize"].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">{s}</span>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Agent loops through Rewrite → Re-Score until score ≥ 70 or max 3 iterations
        </p>
      </div>

      {/* Config */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm">Configure Agent</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Select Resume *</label>
            <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">— Choose resume —</option>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Target Role (optional)</label>
            <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. Senior React Developer"
              value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Job Description (optional — for targeted improvement)</label>
          <textarea rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            placeholder="Paste JD to tailor resume specifically for this role..."
            value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
            <p className="text-red-400 text-sm flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />{error}
            </p>
            {agentDown && (
              <div className="rounded-lg bg-secondary p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Start the agent service:</p>
                <code className="text-xs text-violet-400 block">cd agent-service</code>
                <code className="text-xs text-violet-400 block">pip install -r requirements.txt</code>
                <code className="text-xs text-violet-400 block">uvicorn main:app --reload --port 8000</code>
              </div>
            )}
          </div>
        )}

        <Button onClick={runAgent} disabled={loading || !selectedId}
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700">
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" />{step || "Agent running..."}</>
            : <><Wand2 className="h-4 w-4" />Run Improvement Agent</>}
        </Button>

        {loading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{step}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Agent may loop 1-3 times. Takes 30-90 seconds depending on resume length.
            </p>
          </div>
        )}
      </div>

      {/* Results */}
      {report && (
        <div className="space-y-4">
          {/* Score diff */}
          <ScoreDiff initial={report.initialScore} final={report.finalScore} />

          {/* Download button — prominent */}
          <Button
            onClick={() => downloadImprovedResume(report, originalText || report.improvedSummary, originalFileName)}
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
          >
            <Download className="h-5 w-5" />
            Download Improved Resume (PDF)
          </Button>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Iterations", value: report.iterations, color: "text-violet-400" },
              { label: "Keywords Added", value: report.keywordsAdded.length, color: "text-blue-400" },
              { label: "Bullets Rewritten", value: report.improvedBullets.length, color: "text-green-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Suggested title */}
          {report.titleSuggestion && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-400">Suggested Job Title</p>
                <p className="text-sm font-medium mt-0.5">{report.titleSuggestion}</p>
              </div>
              <CopyButton text={report.titleSuggestion} />
            </div>
          )}

          {/* Improved Summary */}
          {report.improvedSummary && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-violet-400 flex items-center gap-1">
                  <Wand2 className="h-3.5 w-3.5" /> Rewritten Professional Summary
                </p>
                <CopyButton text={report.improvedSummary} />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{report.improvedSummary}</p>
            </div>
          )}

          {/* Keywords added */}
          {report.keywordsAdded.length > 0 && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-green-400 flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" /> Keywords Added ({report.keywordsAdded.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {report.keywordsAdded.map((k) => (
                  <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* Improved Bullets */}
          {report.improvedBullets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Rewritten Bullet Points ({report.improvedBullets.length})
              </p>
              {report.improvedBullets.map((b, i) => (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
                    onClick={() => setExpandedBullet(expandedBullet === i ? null : i)}>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{b.section}</span>
                    <p className="text-xs flex-1 text-muted-foreground truncate">{b.original}</p>
                    {expandedBullet === i ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>
                  {expandedBullet === i && (
                    <div className="border-t border-border p-3 space-y-2">
                      <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
                        <p className="text-[10px] font-semibold text-red-400 mb-1">Original</p>
                        <p className="text-xs text-muted-foreground">{b.original}</p>
                      </div>
                      <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] font-semibold text-green-400">Improved</p>
                          <CopyButton text={b.improved} />
                        </div>
                        <p className="text-xs text-muted-foreground">{b.improved}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">{b.reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Quick Wins */}
          {report.quickWins.length > 0 && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" /> Quick Wins (Do These Now)
              </p>
              <ul className="space-y-1">
                {report.quickWins.map((w) => (
                  <li key={w} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-yellow-400 mt-0.5">→</span>{w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Agent logs */}
          {logs.length > 0 && <AgentLogs logs={logs} />}

          {/* Bottom actions */}
          <div className="flex gap-3">
            <Button
              onClick={() => downloadImprovedResume(report, originalText || report.improvedSummary, originalFileName)}
              className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
            >
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button variant="ghost" onClick={runAgent} disabled={loading} className="flex-1 gap-2">
              <RefreshCw className="h-4 w-4" /> Re-run Agent
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
