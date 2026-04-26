import { randomBytes } from "crypto";

export function newJoinToken(): string {
  return randomBytes(24).toString("base64url");
}

export function displayCodeFromToken(token: string): string {
  const t = token.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  if (t.length < 4) return "----";
  return t.length <= 4 ? t : `${t.slice(0, 3)}·${t.slice(3, 6)}`;
}

export function publicJoinBaseFromRequest(req: { headers: Headers }): string {
  const env = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (env) return env;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
