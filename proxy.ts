import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// ── Security headers ─────────────────────────────────────────────
function addSecurityHeaders(res: NextResponse): NextResponse {
  // Prevent clickjacking
  res.headers.set("X-Frame-Options", "DENY");
  // Prevent MIME sniffing
  res.headers.set("X-Content-Type-Options", "nosniff");
  // XSS protection (legacy browsers)
  res.headers.set("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy — allow mic/camera on this origin (interviews); keep other sensors off
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=()");
  // HSTS — force HTTPS (only in production)
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // Content Security Policy
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js needs unsafe-eval in dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.groq.com https://api.pinecone.io https://api.stripe.com wss:",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  return res;
}

// ── In-memory rate limiter (edge-compatible) ─────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

// ── Protected dashboard routes ───────────────────────────────────
const PROTECTED_PREFIXES = ["/dashboard", "/interview", "/history", "/campaigns", "/feedback", "/upload-resume", "/resume-report", "/settings", "/billing", "/team", "/admin", "/chat", "/question-bank"];

// ── API rate limits ──────────────────────────────────────────────
const API_RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "/api/chat":                    { limit: 20,  windowMs: 60_000 },       // 20/min
  "/api/interview/create":        { limit: 10,  windowMs: 60_000 },       // 10/min
  "/api/feedback/generate":       { limit: 10,  windowMs: 60_000 },       // 10/min
  "/api/resume/upload":           { limit: 5,   windowMs: 60_000 },       // 5/min
  "/api/resume/analyze":          { limit: 5,   windowMs: 60_000 },       // 5/min
  "/api/campaigns":               { limit: 30,  windowMs: 60_000 },       // 30/min
  "/api/auth/forgot-password":    { limit: 3,   windowMs: 15 * 60_000 },  // 3 per 15min
  "/api/auth/reset-password":     { limit: 5,   windowMs: 15 * 60_000 },  // 5 per 15min
  "/api/auth/otp/send":           { limit: 3,   windowMs: 10 * 60_000 },  // 3 per 10min
  "/api/admin":                   { limit: 60,  windowMs: 60_000 },       // 60/min
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getIP(req);

  // ── 1. Apply rate limits on API routes ──────────────────────
  for (const [route, config] of Object.entries(API_RATE_LIMITS)) {
    if (pathname.startsWith(route)) {
      const allowed = checkRateLimit(`${ip}:${route}`, config.limit, config.windowMs);
      if (!allowed) {
        return new NextResponse(
          JSON.stringify({ error: "Too many requests. Please slow down." }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(config.windowMs / 1000)),
            },
          }
        );
      }
      break;
    }
  }

  // ── 2. Protect dashboard routes ──────────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Admin-only routes
    if (pathname.startsWith("/admin") && token.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // ── 3. Add security headers to all responses ─────────────────
  const res = NextResponse.next();
  return addSecurityHeaders(res);
}

export const config = {
  matcher: [
    // Match all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
