"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Upload, MessageSquare, Briefcase, Zap, Wand2,
  BookOpen, BarChart3, Bot, ArrowRight, Sparkles,
} from "lucide-react";

const CANDIDATE_FEATURES = [
  {
    href: "/upload-resume",
    icon: Upload,
    title: "Upload Resume",
    description: "Upload PDF/DOCX — AI analyzes and scores your resume",
    color: "border-violet-500/30 bg-violet-500/5 hover:border-violet-500/60",
    iconColor: "text-violet-400",
    badge: "Start here",
  },
  {
    href: "/resume-improve",
    icon: Wand2,
    title: "AI Resume Improve",
    description: "LangGraph agent rewrites your resume until ATS score ≥ 70",
    color: "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60",
    iconColor: "text-blue-400",
    badge: "LangGraph AI",
  },
  {
    href: "/interview/setup",
    icon: MessageSquare,
    title: "Practice Interview",
    description: "AI mock interview with voice, panel mode, and real-time feedback",
    color: "border-green-500/30 bg-green-500/5 hover:border-green-500/60",
    iconColor: "text-green-400",
    badge: "Most popular",
  },
  {
    href: "/job-agent",
    icon: Briefcase,
    title: "Job Agent",
    description: "Paste JD → AI writes cover letter, preps interview, builds checklist",
    color: "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/60",
    iconColor: "text-orange-400",
    badge: null,
  },
  {
    href: "/auto-apply",
    icon: Zap,
    title: "Auto Apply Agent",
    description: "AI fetches jobs, matches resume, generates cover letter, sends email",
    color: "border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/60",
    iconColor: "text-yellow-400",
    badge: "New 🔥",
  },
  {
    href: "/history",
    icon: BarChart3,
    title: "Interview History",
    description: "View all past interviews, scores, and detailed feedback",
    color: "border-pink-500/30 bg-pink-500/5 hover:border-pink-500/60",
    iconColor: "text-pink-400",
    badge: null,
  },
  {
    href: "/ai-agents",
    icon: Bot,
    title: "AI Agents Hub",
    description: "Learning path, market intelligence, salary insights",
    color: "border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/60",
    iconColor: "text-cyan-400",
    badge: "5 agents",
  },
  {
    href: "/chat",
    icon: Sparkles,
    title: "AI Assistant",
    description: "Ask anything about your interviews, scores, and progress",
    color: "border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500/60",
    iconColor: "text-indigo-400",
    badge: null,
  },
];

export default function CandidateHomePage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-blue-500/5 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-2xl">
            👤
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, {firstName}! 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Your AI-powered job search assistant. Upload resume → Practice interviews → Auto apply.
            </p>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <Link href="/upload-resume"
                className="flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium transition-colors">
                <Upload className="h-4 w-4" /> Upload Resume
              </Link>
              <Link href="/interview/setup"
                className="flex items-center gap-2 rounded-lg border border-border hover:bg-accent px-4 py-2 text-sm font-medium transition-colors">
                <MessageSquare className="h-4 w-4" /> Start Interview
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended flow */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Recommended Flow
        </p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          {["Upload Resume", "AI Improve", "Practice Interview", "Job Agent", "Auto Apply"].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-secondary border border-border font-medium text-foreground">
                {i + 1}. {step}
              </span>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 shrink-0" />}
            </span>
          ))}
        </div>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {CANDIDATE_FEATURES.map(({ href, icon: Icon, title, description, color, iconColor, badge }) => (
          <Link key={href} href={href}
            className={`group rounded-xl border p-4 transition-all ${color}`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-background/50 ${iconColor}`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              {badge && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-background/60 text-muted-foreground border border-border">
                  {badge}
                </span>
              )}
            </div>
            <p className="font-semibold text-sm mb-1">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              Open <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
