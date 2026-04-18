import { NextResponse } from "next/server";

// ── Consistent API response helpers ─────────────────────────────

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function notFound(resource = "Resource") {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

export function serverError(context: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, msg);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// ── Timeout wrapper for external API calls ───────────────────────
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return fallback;
  }
}
