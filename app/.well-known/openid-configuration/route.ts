/** OpenID Connect Discovery — some MCP clients try this first. Same endpoints; no ID tokens are issued. */
import { openIdConfiguration } from "@/lib/oauth/server";
import { corsPreflight, jsonCors } from "@/lib/oauth/http";

export function GET() {
  return jsonCors(openIdConfiguration());
}

export function OPTIONS() {
  return corsPreflight("GET, OPTIONS");
}
