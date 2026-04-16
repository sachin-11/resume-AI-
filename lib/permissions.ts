export type UserRole = "admin" | "recruiter" | "viewer";

export const PERMISSIONS = {
  // Campaigns
  createCampaign:   ["admin", "recruiter"],
  viewCampaigns:    ["admin", "recruiter", "viewer"],
  deleteCampaign:   ["admin"],
  inviteCandidate:  ["admin", "recruiter"],

  // Reports / Analytics
  viewReports:      ["admin", "recruiter", "viewer"],
  viewAudio:        ["admin", "recruiter"],

  // Team management
  manageTeam:       ["admin"],
  viewTeam:         ["admin", "recruiter", "viewer"],

  // Interviews (own)
  createInterview:  ["admin", "recruiter"],
  viewInterviews:   ["admin", "recruiter", "viewer"],

  // Resume
  uploadResume:     ["admin", "recruiter"],
  viewResumes:      ["admin", "recruiter", "viewer"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

// Server-side helper — use in API routes
export function requireRole(userRole: string | undefined, permission: Permission): boolean {
  if (!userRole) return false;
  return can(userRole as UserRole, permission);
}
