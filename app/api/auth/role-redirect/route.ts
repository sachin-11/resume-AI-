/**
 * GET /api/auth/role-redirect
 * Redirects user to the correct home page based on their role.
 * Used after Google OAuth login.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const role = session.user.role;
  const dest = role === "candidate" ? "/candidate-home" : "/dashboard";

  return NextResponse.redirect(new URL(dest, process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
}
