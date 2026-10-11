/** RFC 8414 Authorization Server Metadata (PKCE S256, CIMD, iss-in-response advertised). */
import { authorizationServerMetadata } from "@/lib/oauth/server";
import { corsPreflight, jsonCors } from "@/lib/oauth/http";

export function GET() {
  return jsonCors(authorizationServerMetadata());
}

export function OPTIONS() {
  return corsPreflight("GET, OPTIONS");
}
