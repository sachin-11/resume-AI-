export type UserRole = "admin" | "recruiter" | "viewer" | "candidate";

export const PERMISSIONS = {
  // ── Recruiter features ───────────────────────────────────────
  createCampaign:   ["admin", "recruiter"],
  viewCampaigns:    ["admin", "recruiter", "viewer"],
  deleteCampaign:   ["admin"],
  inviteCandidate:  ["admin", "recruiter"],
  viewReports:      ["admin", "recruiter", "viewer"],
  viewAudio:        ["admin", "recruiter"],
  manageTeam:       ["admin"],
  viewTeam:         ["admin", "recruiter", "viewer"],

  // ── Candidate features ───────────────────────────────────────
  createInterview:  ["admin", "recruiter", "candidate"],
  viewInterviews:   ["admin", "recruiter", "viewer", "candidate"],
  uploadResume:     ["admin", "recruiter", "candidate"],
  viewResumes:      ["admin", "recruiter", "viewer", "candidate"],
  useJobAgent:      ["admin", "candidate"],
  useAutoApply:     ["admin", "candidate"],
  useAIAgents:      ["admin", "recruiter", "candidate"],

  // ── Admin only ───────────────────────────────────────────────
  viewAdmin:        ["admin"],
  manageBilling:    ["admin", "recruiter"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function requireRole(userRole: string | undefined, permission: Permission): boolean {
  if (!userRole) return false;
  return can(userRole as UserRole, permission);
}

// ── Role metadata ────────────────────────────────────────────────
export const ROLE_META: Record<UserRole, {
  label: string;
  description: string;
  emoji: string;
  color: string;
  badgeClass: string;
  defaultRedirect: string;
}> = {
  admin: {
    label: "Admin",
    description: "Full platform access — manage everything",
    emoji: "🔑",
    color: "text-violet-400",
    badgeClass: "bg-violet-500/20 text-violet-400",
    defaultRedirect: "/dashboard",
  },
  recruiter: {
    label: "Recruiter",
    description: "Hire candidates — campaigns, job match, screening",
    emoji: "🏢",
    color: "text-blue-400",
    badgeClass: "bg-blue-500/20 text-blue-400",
    defaultRedirect: "/dashboard",
  },
  candidate: {
    label: "Candidate",
    description: "Find jobs — resume, interviews, auto apply",
    emoji: "👤",
    color: "text-green-400",
    badgeClass: "bg-green-500/20 text-green-400",
    defaultRedirect: "/candidate-home",
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access",
    emoji: "👁️",
    color: "text-muted-foreground",
    badgeClass: "bg-secondary text-muted-foreground",
    defaultRedirect: "/dashboard",
  },
};
