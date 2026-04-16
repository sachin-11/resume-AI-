import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { rateLimit, RATE_LIMITS, getIP, rateLimitResponse } from "@/lib/rate-limit";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "secret");

// POST /api/candidate/auth — login with email + token (or password)
export async function POST(req: NextRequest) {
  const rl = rateLimit(getIP(req), RATE_LIMITS.candidateAuth);
  if (!rl.success) return rateLimitResponse(rl);
  try {
    const { email, token, password } = await req.json();

    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    // Find invite by email
    const invite = await db.candidateInvite.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { campaign: { select: { role: true, title: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (!invite) return NextResponse.json({ error: "No interview found for this email" }, { status: 404 });

    // Auth: token OR password
    if (token) {
      if (invite.token !== token) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    } else if (password) {
      if (!invite.portalPassword) return NextResponse.json({ error: "Password not set. Use your invite link." }, { status: 401 });
      const valid = await bcrypt.compare(password, invite.portalPassword);
      if (!valid) return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    } else {
      return NextResponse.json({ error: "Token or password required" }, { status: 400 });
    }

    // Issue JWT for candidate portal
    const jwt = await new SignJWT({
      sub: invite.id,
      email: invite.email,
      name: invite.name ?? "",
      type: "candidate",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(SECRET);

    const res = NextResponse.json({ success: true, name: invite.name });
    res.cookies.set("candidate_token", jwt, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("[CANDIDATE_AUTH]", err);
    return NextResponse.json({ error: "Auth failed" }, { status: 500 });
  }
}

// DELETE — logout
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("candidate_token");
  return res;
}
