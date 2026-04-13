"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, CheckCircle, AlertCircle, Lightbulb, TrendingUp, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ResumeAnalysis } from "@/types";
import { formatDate, getScoreColor, getScoreBg } from "@/lib/utils";

interface ResumeItem {
  id: string;
  fileName: string;
  fileType: string;
  analysisReport: ResumeAnalysis | null;
  createdAt: string;
}

export default function ResumeReportPage() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [selected, setSelected] = useState<ResumeItem | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (resumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold">No resumes yet</h2>
        <p className="text-muted-foreground text-sm mt-1 mb-4">Upload your resume to get AI analysis</p>
        <Button asChild><Link href="/upload-resume">Upload Resume</Link></Button>
      </div>
    );
  }

  const analysis = selected?.analysisReport;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resume Reports</h1>
          <p className="text-muted-foreground mt-1">AI-powered analysis of your resume</p>
        </div>
        <Button asChild variant="outline"><Link href="/upload-resume">Upload New</Link></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Resume List */}
        <div className="space-y-2">
          {resumes.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className={`w-full text-left rounded-lg border p-3 transition-all ${
                selected?.id === r.id ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-accent"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                </div>
              </div>
              {r.analysisReport && (
                <div className="mt-2">
                  <span className={`text-xs font-bold ${getScoreColor(r.analysisReport.overallScore)}`}>
                    Score: {r.analysisReport.overallScore}/100
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Analysis */}
        <div className="lg:col-span-3 space-y-4">
          {!analysis ? (
            <Card>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">No analysis available for this resume</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Score Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className={`text-3xl font-bold ${getScoreColor(analysis.overallScore)}`}>
                      {analysis.overallScore}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
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

              {/* Skills */}
              <Card>
                <CardHeader><CardTitle className="text-base">Detected Skills</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {analysis.skills.map((s) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Strengths & Missing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" />Strengths</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.strengths.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-green-500 mt-0.5">✓</span>{s}
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
                          <span className="text-yellow-500 mt-0.5">!</span>{s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* ATS Suggestions */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4 text-violet-500" />ATS Suggestions</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.atsSuggestions.map((s) => (
                      <li key={s} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-violet-500 mt-0.5">→</span>{s}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Better Summary */}
              <Card>
                <CardHeader><CardTitle className="text-base">Suggested Summary</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic border-l-2 border-violet-500 pl-4">
                    &ldquo;{analysis.betterSummary}&rdquo;
                  </p>
                </CardContent>
              </Card>

              {/* Career Recommendations */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-500" />Career Recommendations</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.careerRecommendations.map((r, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">{i + 1}.</span>{r}
                      </li>
                    ))}
                  </ul>
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
