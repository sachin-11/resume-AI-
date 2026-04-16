/**
 * Simple in-memory rate limiter
 * Works per-IP, resets after window expires
 * No external service needed
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Global store — persists across requests in same process
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  limit: number;       // max requests
  windowMs: number;    // time window in ms
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number; // seconds until reset
}

export function rateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  const entry = store.get(key);

  // New or expired entry
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { success: true, remaining: config.limit - 1, resetAt: now + config.windowMs };
  }

  // Within window
  if (entry.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// ── Preset configs ───────────────────────────────────────────────
export const RATE_LIMITS = {
  // Public interview endpoints — generous but protected
  publicInterview: { limit: 30, windowMs: 60 * 1000 },       // 30/min per IP
  publicAnswer:    { limit: 60, windowMs: 60 * 1000 },        // 60/min per IP
  publicComplete:  { limit: 10, windowMs: 60 * 1000 },        // 10/min per IP
  publicPhoto:     { limit: 5,  windowMs: 60 * 1000 },        // 5/min per IP
  tabSwitch:       { limit: 100, windowMs: 60 * 1000 },       // 100/min per IP

  // Auth endpoints — strict
  login:           { limit: 10, windowMs: 15 * 60 * 1000 },   // 10 per 15min
  register:        { limit: 5,  windowMs: 60 * 60 * 1000 },   // 5 per hour

  // Candidate auth
  candidateAuth:   { limit: 10, windowMs: 15 * 60 * 1000 },   // 10 per 15min

  // Invite booking
  bookSlot:        { limit: 5,  windowMs: 60 * 1000 },        // 5/min per IP
} as const;

// ── Helper: get IP from Next.js request ─────────────────────────
export function getIP(req: Request): string {
  const forwarded = (req as unknown as { headers: { get: (k: string) => string | null } })
    .headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIP = (req as unknown as { headers: { get: (k: string) => string | null } })
    .headers.get("x-real-ip");
  if (realIP) return realIP;

  return "unknown";
}

// ── Helper: return 429 response ──────────────────────────────────
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down.", retryAfter: result.retryAfter }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfter ?? 60),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
