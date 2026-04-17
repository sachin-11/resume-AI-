"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText, Loader2, CheckCircle, AlertCircle, Lightbulb,
  TrendingUp, ArrowRight, User, Briefcase, GraduationCap,
  Code2, FolderGit2, Award, Search, X, ChevronDown, ChevronUp, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ResumeAnalysis } from "@/types";
import { formatDate, getScoreColor, getScoreBg } from "@/lib/utils";

interface ResumeItem {
  id: string;
  fileName: string;
  fileType: string;
  analysisReport: ResumeAnalysis | null;
  createdAt: string;
}

// ── Skill category badge colors ──────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  languages:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  frameworks: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  databases:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  tools:      "bg-green-500/15 text-green-400 border-green-500/30",
  cloud:      "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  other:      "bg-secondary text-muted-foreground border-border",
};

function ResumeReportContent() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [selected, setSelected] = useState<ResumeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");

  // ATS match state
  const [jd, setJd] = useState("");
  const [atsLoading, setAtsLoading] = useState(false);
  const [showJdInput, setShowJdInput] = useState(false);

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    structured: true, skills: true, strengths: true, ats: true, suggestions: true,
  });
  function toggle(key: string) {
    setOpenSections((p) => ({ ...p, [key]: !p[key] }));
  }

  useEffect(() => {
    fetch("/api/resume/list")
      .then((r) => r.json())
      .then((d) => {
        setResumes(d.resumes ?? []);
        if (selectedId) {
          const found = d.resumes?.find((r: ResumeItem) => r.id === selectedId);
          if (found) setSelected(found);
        } else if (d.resumes?.length > 0) {
          setSelected(d.resumes[0]);
        }
      })
      .finally(() => setLoading(false));
  }, [selectedId]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this resume? This cannot be undone.")) return;
    setDeletingId(id);
    const res = await fetch(`/api/resume/${id}`, { method: "DELETE" });
    if (res.ok) {
      const updated = resumes.filter((r) => r.id !== id);
      setResumes(updated);
      if (selected?.id === id) setSelected(updated[0] ?? null);
    }
    setDeletingId("");
  }

  async function handleAtsMatch() {
    if (!selected || !jd.trim()) return;
    setAtsLoading(true);
    const res = await fetch("/api/resume/ats-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeId: selected.id, jobDescription: jd }),
    });
    const data = await res.json();
    if (res.ok && data.atsMatch) {
      setSelected((p) => p ? {
        ...p,
        analysisReport: p.analysisReport ? { ...p.analysisReport, atsMatch: data.atsMatch } : p.analysisReport,
      } : p);
    }
    setAtsLoading(false);
    setShowJdInput(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (resumes.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold">No resumes yet</h2>
      <p className="text-muted-foreground text-sm mt-1 mb-4">Upload your resume to get AI analysis</p>
      <Button asChild><Link href="/upload-resume">Upload Resume</Link></Button>
    </div>
  );

  const analysis = selected?.analysisReport;
  const sd = analysis?.structuredData;
  const atsMatch = analysis?.atsMatch;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Resume Reports</h1>
          <p className="text-muted-foreground mt-1">AI-powered structured analysis</p>
        </div>
        <Button asChild variant="outline"><Link href="/upload-resume">Upload New</Link></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Resume List */}
        <div className="space-y-2">
          {resumes.map((r) => (
            <div key={r.id} className={`group relative rounded-lg border transition-all ${
              selected?.id === r.id ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-accent"
            }`}>
              <button className="w-full text-left p-3" onClick={() => setSelected(r)}>
                <div className="flex items-center gap-2 pr-6">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                  </div>
                </div>
                {r.analysisReport && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`text-xs font-bold ${getScoreColor(r.analysisReport.overallScore)}`}>
                      {r.analysisReport.overallScore}/100
                    </span>
                    {r.analysisReport.atsMatch && (
                      <span className={`text-xs font-bold ${getScoreColor(r.analysisReport.atsMatch.score)}`}>
                        ATS {r.analysisReport.atsMatch.score}%
                      </span>
                    )}
                  </div>
                )}
              </button>
              {/* Delete button */}
              <button
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                title="Delete resume"
              >
                {deletingId === r.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>

        {/* Analysis */}
        <div className="lg:col-span-3 space-y-4">
          {!analysis ? (
            <Card><CardContent className="flex items-center justify-center h-48">
              <p className="text-muted-foreground">No analysis available for this resume</p>
            </CardContent></Card>
          ) : (
            <>
              {/* ── Score Overview ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className={`text-3xl font-bold ${getScoreColor(analysis.overallScore)}`}>{analysis.overallScore}</p>
                    <p className="text-xs text-muted-foreground mt-1">Resume Score</p>
                    <Progress value={analysis.overallScore} className="mt-2 h-1" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xl font-bold text-blue-400 capitalize">{analysis.experienceLevel}</p>
                    <p className="text-xs text-muted-foreground mt-1">Level</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xl font-bold text-violet-400">{analysis.yearsOfExperience}y</p>
                    <p className="text-xs text-muted-foreground mt-1">Experience</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm font-bold text-orange-400 truncate">{analysis.detectedRole}</p>
                    <p className="text-xs text-muted-foreground mt-1">Detected Role</p>
                  </CardContent>
                </Card>
              </div>

              {/* ── ATS Match against JD ── */}
              <Card className="border-violet-500/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Search className="h-4 w-4 text-violet-400" /> ATS Match Score
                    </CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setShowJdInput(!showJdInput)}>
                      {showJdInput ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                      {showJdInput ? "Cancel" : "Match with JD"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showJdInput && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Paste the job description here..."
                        value={jd}
                        onChange={(e) => setJd(e.target.value)}
                        className="min-h-[120px] text-sm"
                      />
                      <Button onClick={handleAtsMatch} disabled={!jd.trim() || atsLoading} size="sm">
                        {atsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        {atsLoading ? "Analyzing…" : "Analyze Match"}
                      </Button>
                    </div>
                  )}

                  {atsMatch ? (
                    <div className="space-y-4">
                      {/* Score bar */}
                      <div className="flex items-center gap-4">
                        <div className={`text-4xl font-black ${getScoreColor(atsMatch.score)}`}>{atsMatch.score}%</div>
                        <div className="flex-1">
                          <Progress value={atsMatch.score} className="h-3" />
                          <p className="text-xs text-muted-foreground mt-1">
                            {atsMatch.score >= 80 ? "Excellent match!" : atsMatch.score >= 60 ? "Good match" : atsMatch.score >= 40 ? "Moderate match" : "Low match — needs improvement"}
                          </p>
                        </div>
                      </div>

                      {/* Recommendation */}
                      <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 px-4 py-3">
                        <p className="text-sm text-muted-foreground">{atsMatch.recommendation}</p>
                      </div>

                      {/* Keywords grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Matched */}
                        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                          <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Matched ({atsMatch.matchedKeywords.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {atsMatch.matchedKeywords.map((k) => (
                              <span key={k} className="text-xs bg-green-500/15 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">{k}</span>
                            ))}
                          </div>
                        </div>
                        {/* Missing */}
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                          <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Missing ({atsMatch.missingKeywords.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {atsMatch.missingKeywords.map((k) => (
                              <span key={k} className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5">{k}</span>
                            ))}
                          </div>
                        </div>
                        {/* Extra */}
                        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                          <p className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1">
                            <Award className="h-3 w-3" /> Bonus Skills ({atsMatch.extraKeywords.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {atsMatch.extraKeywords.map((k) => (
                              <span key={k} className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">{k}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Paste a job description above to see how well your resume matches.</p>
                  )}
                </CardContent>
              </Card>

              {/* ── Structured Data ── */}
              {sd && (
                <Card>
                  <CardHeader>
                    <button className="flex items-center justify-between w-full" onClick={() => toggle("structured")}>
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-400" /> Parsed Resume Data
                      </CardTitle>
                      {openSections.structured ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </CardHeader>
                  {openSections.structured && (
                    <CardContent className="space-y-5">
                      {/* Contact */}
                      {sd.contactInfo && Object.values(sd.contactInfo).some(Boolean) && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contact Info</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(sd.contactInfo).filter(([, v]) => v).map(([k, v]) => (
                              <div key={k} className="rounded-lg bg-secondary/50 px-3 py-2">
                                <p className="text-[10px] text-muted-foreground capitalize">{k}</p>
                                <p className="text-xs font-medium truncate">{v}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Experience */}
                      {sd.experience?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Briefcase className="h-3 w-3" /> Experience
                          </p>
                          <div className="space-y-3">
                            {sd.experience.map((exp, i) => (
                              <div key={i} className="rounded-lg border border-border p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold">{exp.role}</p>
                                    <p className="text-xs text-violet-400">{exp.company}</p>
                                  </div>
                                  <span className="text-xs text-muted-foreground shrink-0">{exp.duration}</span>
                                </div>
                                {exp.highlights?.length > 0 && (
                                  <ul className="mt-2 space-y-1">
                                    {exp.highlights.map((h, j) => (
                                      <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                        <span className="text-violet-400 mt-0.5 shrink-0">•</span>{h}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Education */}
                      {sd.education?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" /> Education
                          </p>
                          <div className="space-y-2">
                            {sd.education.map((edu, i) => (
                              <div key={i} className="rounded-lg border border-border p-3 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium">{edu.degree}</p>
                                  <p className="text-xs text-muted-foreground">{edu.institution}</p>
                                </div>
                                {edu.year && <span className="text-xs text-muted-foreground">{edu.year}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Skills by category */}
                      {sd.skillsByCategory && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Code2 className="h-3 w-3" /> Skills by Category
                          </p>
                          <div className="space-y-2">
                            {Object.entries(sd.skillsByCategory).filter(([, v]) => v?.length > 0).map(([cat, skills]) => (
                              <div key={cat} className="flex items-start gap-3">
                                <span className="text-xs text-muted-foreground capitalize w-20 shrink-0 pt-0.5">{cat}</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {(skills as string[]).map((s) => (
                                    <span key={s} className={`text-xs border rounded-full px-2 py-0.5 ${CAT_COLORS[cat] ?? CAT_COLORS.other}`}>{s}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Projects */}
                      {sd.projects?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                            <FolderGit2 className="h-3 w-3" /> Projects
                          </p>
                          <div className="space-y-2">
                            {sd.projects.map((p, i) => (
                              <div key={i} className="rounded-lg border border-border p-3">
                                <p className="text-sm font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {p.tech?.map((t) => (
                                    <span key={t} className="text-[10px] bg-secondary rounded px-1.5 py-0.5">{t}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Certifications */}
                      {sd.certifications?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Award className="h-3 w-3" /> Certifications
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {sd.certifications.map((c) => (
                              <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* ── Skills (flat list) ── */}
              <Card>
                <CardHeader>
                  <button className="flex items-center justify-between w-full" onClick={() => toggle("skills")}>
                    <CardTitle className="text-base">All Detected Skills</CardTitle>
                    {openSections.skills ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </CardHeader>
                {openSections.skills && (
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analysis.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* ── Strengths & Missing ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" />Strengths</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.strengths.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-green-500 mt-0.5 shrink-0">✓</span>{s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-4 w-4 text-yellow-500" />Missing Skills</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.missingSkills.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-yellow-500 mt-0.5 shrink-0">!</span>{s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* ── ATS Suggestions ── */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4 text-violet-500" />ATS Suggestions</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.atsSuggestions.map((s) => (
                      <li key={s} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-violet-500 mt-0.5 shrink-0">→</span>{s}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* ── Better Summary ── */}
              <Card>
                <CardHeader><CardTitle className="text-base">AI-Suggested Summary</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic border-l-2 border-violet-500 pl-4">
                    &ldquo;{analysis.betterSummary}&rdquo;
                  </p>
                </CardContent>
              </Card>

              {/* ── Career Recommendations ── */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-500" />Career Recommendations</CardTitle></CardHeader>
                <CardContent>
                  <ol className="space-y-2">
                    {analysis.careerRecommendations.map((r, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5 shrink-0">{i + 1}.</span>{r}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              <Button asChild className="w-full">
                <Link href="/interview/setup">
                  Start Interview Based on This Resume <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResumeReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResumeReportContent />
    </Suspense>
  );
}
