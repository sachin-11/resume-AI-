import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { sendTeamInvite } from "@/lib/mailer";

// GET — list team members
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find org owned by this user
  const org = await db.organization.findUnique({
    where: { ownerId: session.user.id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ org, members: org?.members ?? [] });
}

// POST — invite a team member (admin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireRole(session.user.role, "manageTeam")) {
    return NextResponse.json({ error: "Only admins can invite team members" }, { status: 403 });
  }

  const { email, name, role, orgName } = await req.json();
  if (!email || !role) return NextResponse.json({ error: "email and role required" }, { status: 400 });
  if (!["recruiter", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Role must be recruiter or viewer" }, { status: 400 });
  }

  // Get or create org
  let org = await db.organization.findUnique({ where: { ownerId: session.user.id } });
  if (!org) {
    org = await db.organization.create({
      data: { name: orgName ?? "My Organization", ownerId: session.user.id },
    });
  }

  // Check if user already exists
  let invitedUser = await db.user.findUnique({ where: { email } });

  if (invitedUser) {
    // Check if already a member
    const existing = await db.teamMember.findUnique({ where: { userId: invitedUser.id } });
    if (existing) return NextResponse.json({ error: "User already in team" }, { status: 400 });
  } else {
    // Create user with temp password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashed = await bcrypt.hash(tempPassword, 10);
    invitedUser = await db.user.create({
      data: { email, name: name ?? "", password: hashed, role },
    });

    // Send invite email with temp password (non-blocking)
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const inviter = await db.user.findUnique({
        where: { id: session.user.id },
        select: { name: true },
      });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      sendTeamInvite({
        to: email,
        memberName: name ?? "",
        inviterName: inviter?.name ?? "Your admin",
        orgName: org.name,
        role,
        tempPassword,
        loginUrl: `${appUrl}/login`,
      }).catch((e) => console.error("[TEAM_INVITE_EMAIL]", e));
    }
  }

  // Add to team
  await db.teamMember.create({
    data: { orgId: org.id, userId: invitedUser.id, role, invitedBy: session.user.id },
  });

  // Update user role
  await db.user.update({ where: { id: invitedUser.id }, data: { role } });

  return NextResponse.json({ success: true });
}
