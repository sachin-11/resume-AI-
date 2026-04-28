"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, FileText, Upload, MessageSquare,
  BarChart3, Settings, LogOut, Brain, ChevronRight,
  User, Users, Shield, BookOpen, Zap, CreditCard, Sparkles, Headphones, Menu, X, Sun, Moon, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { useTheme } from "@/components/providers/theme-provider";

const NAV_ITEMS = [
  { href: "/dashboard",         label: "Dashboard",         icon: LayoutDashboard },
  { href: "/chat",              label: "AI Assistant",      icon: Sparkles },
  { href: "/upload-resume",     label: "Upload Resume",     icon: Upload,        perm: "uploadResume" },
  { href: "/resume-report",     label: "Resume Reports",    icon: FileText,      perm: "viewResumes" },
  { href: "/interview/setup",   label: "New Interview",     icon: MessageSquare, perm: "createInterview" },
  { href: "/interview/copilot", label: "AI Copilot",        icon: Headphones,   perm: "viewInterviews" },
  { href: "/history",           label: "Interview History", icon: BarChart3,     perm: "viewInterviews" },
  { href: "/campaigns",         label: "Bulk Interviews",   icon: Users,         perm: "viewCampaigns" },
  { href: "/job-match",         label: "Job Match",         icon: Briefcase,     perm: "viewCampaigns" },
  { href: "/question-bank",     label: "Question Bank",     icon: BookOpen,      perm: "createInterview" },
  { href: "/team",              label: "Team",              icon: Shield,        perm: "viewTeam" },
  { href: "/settings/webhooks", label: "Webhooks",          icon: Zap,           perm: "manageTeam" },
  { href: "/billing",           label: "Billing",           icon: CreditCard,    adminOnly: true },
  { href: "/settings",          label: "Settings",          icon: Settings },
] as const;

const ROLE_BADGE: Record<string, string> = {
  admin:     "bg-violet-500/20 text-violet-400",
  recruiter: "bg-blue-500/20 text-blue-400",
  viewer:    "bg-green-500/20 text-green-400",
};

// ── Shared nav content ───────────────────────────────────────────
function NavContent({
  pathname, session, role, onClose,
}: {
  pathname: string;
  session: { user?: { name?: string | null } } | null;
  role: "admin" | "recruiter" | "viewer";
  onClose?: () => void;
}) {
  const { theme, toggle } = useTheme();
  const items = NAV_ITEMS.filter((item) => {
    if ("adminOnly" in item && item.adminOnly) return role === "admin";
    if ("perm" in item && item.perm) {
      try { return can(role, item.perm as Parameters<typeof can>[1]); } catch { return false; }
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm">AI Resume Coach</p>
            <p className="text-xs text-muted-foreground">Interview Prep</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/settings" && pathname.startsWith(href + "/"));
          return (
            <Link key={href} href={href} onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                active ? "bg-violet-600/10 text-violet-500" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-violet-500")} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3 w-3 text-violet-500" />}
            </Link>
          );
        })}
      </nav>

      {/* User + Theme toggle */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/20">
            <User className="h-4 w-4 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session?.user?.name ?? "User"}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${ROLE_BADGE[role] ?? ROLE_BADGE.viewer}`}>
              {role}
            </span>
          </div>
          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
        <Button variant="ghost" size="sm"
          className="w-full justify-start text-muted-foreground hover:text-red-400"
          onClick={() => signOut({ callbackUrl: "/" })}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "admin") as "admin" | "recruiter" | "viewer";
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      {/* ── Desktop sidebar (always visible on lg+) ── */}
      <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-64 flex-col">
        <NavContent pathname={pathname} session={session} role={role} />
      </aside>

      {/* ── Mobile: hamburger button ── */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="lg:hidden fixed top-4 left-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border shadow-md"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* ── Mobile: drawer overlay ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 h-full shadow-2xl">
            <NavContent pathname={pathname} session={session} role={role} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
