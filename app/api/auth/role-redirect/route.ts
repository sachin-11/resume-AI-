/**
 * GET /api/auth/role-redirect
 * Redirects user to the correct home page based on their role.
 * Used after Google OAuth login.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const role = session.user.role;
  // ?next= — where the user was going before login (e.g. an OAuth consent screen); same-site paths only.
  const next = req.nextUrl.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
  const dest = role === "candidate" ? "/candidate-home" : safeNext ?? "/dashboard";

  return NextResponse.redirect(new URL(dest, process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
}
