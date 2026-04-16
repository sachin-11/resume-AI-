"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, FileText, Upload, MessageSquare,
  BarChart3, Settings, LogOut, Brain, ChevronRight, User, Users, Shield, BookOpen, Zap, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "admin") as "admin" | "recruiter" | "viewer";

  const navItems = [
    { href: "/dashboard",       label: "Dashboard",         icon: LayoutDashboard, show: true },
    { href: "/upload-resume",   label: "Upload Resume",     icon: Upload,          show: can(role, "uploadResume") },
    { href: "/resume-report",   label: "Resume Reports",    icon: FileText,        show: can(role, "viewResumes") },
    { href: "/interview/setup", label: "New Interview",     icon: MessageSquare,   show: can(role, "createInterview") },
    { href: "/history",         label: "Interview History", icon: BarChart3,       show: can(role, "viewInterviews") },
    { href: "/campaigns",       label: "Bulk Interviews",   icon: Users,           show: can(role, "viewCampaigns") },
    { href: "/question-bank",   label: "Question Bank",     icon: BookOpen,        show: can(role, "createInterview") },
    { href: "/team",            label: "Team",              icon: Shield,          show: can(role, "viewTeam") },
    { href: "/settings/webhooks", label: "Webhooks",        icon: Zap,             show: can(role, "manageTeam") },
    { href: "/billing",         label: "Billing",           icon: CreditCard,      show: role === "admin" },
    { href: "/settings",        label: "Settings",          icon: Settings,        show: true },
  ].filter((i) => i.show);

  const ROLE_BADGE: Record<string, string> = {
    admin:     "bg-violet-500/20 text-violet-400",
    recruiter: "bg-blue-500/20 text-blue-400",
    viewer:    "bg-green-500/20 text-green-400",
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
          <Brain className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm">AI Resume Coach</p>
          <p className="text-xs text-muted-foreground">Interview Prep</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/settings" && pathname.startsWith(href + "/"));
          return (
            <Link key={href} href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-violet-600/10 text-violet-500"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-violet-500")} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3 w-3 text-violet-500" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/20">
            <User className="h-4 w-4 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session?.user?.name ?? "User"}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${ROLE_BADGE[role] ?? ROLE_BADGE.viewer}`}>
              {role}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm"
          className="w-full justify-start text-muted-foreground hover:text-red-400"
          onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
