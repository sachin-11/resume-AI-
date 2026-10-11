#!/usr/bin/env node
/**
 * Mint a local-dev access token for the Resume-AI MCP server — for MCP Inspector,
 * the contract tests and curl, before/without the OAuth flow. Same claims the
 * Authorization Server issues (iss, aud = MCP resource, sub, scope, client_id).
 *
 *   node scripts/mcp-dev-token.mjs --user <userId> [--scopes "candidates:read screening:run"] [--ttl 3600]
 *
 * Reads MCP_TOKEN_SECRET and MCP_PUBLIC_URL from the environment or .env.local.
 * Refuses to run with NODE_ENV=production: real clients use OAuth.
 */
import { readFileSync, existsSync } from "fs";
import { SignJWT } from "jose";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to mint dev tokens with NODE_ENV=production — use the OAuth flow.");
  process.exit(1);
}

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.user) {
  console.error("Usage: node scripts/mcp-dev-token.mjs --user <userId> [--scopes \"candidates:read screening:run interviews:write\"] [--ttl 3600]");
  process.exit(1);
}
const secret = process.env.MCP_TOKEN_SECRET ?? "";
if (secret.length < 32) {
  console.error("MCP_TOKEN_SECRET (32+ chars) is not set.");
  process.exit(1);
}
const base = (process.env.MCP_PUBLIC_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");

const token = await new SignJWT({ scope: args.scopes ?? "candidates:read", client_id: "dev-token-script", role: "recruiter", org: null })
  .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
  .setIssuer(base)
  .setAudience(`${base}/api/mcp`)
  .setSubject(args.user)
  .setIssuedAt()
  .setExpirationTime(`${Number(args.ttl ?? 3600)}s`)
  .setJti(crypto.randomUUID())
  .sign(new TextEncoder().encode(secret));
process.stdout.write(token + "\n");
