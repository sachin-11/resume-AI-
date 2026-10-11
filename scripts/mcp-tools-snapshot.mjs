#!/usr/bin/env node
/**
 * Snapshot of what the MCP server tells a model about its tools (tools/list: name,
 * description, input schema, annotations) → agent-service/evals/mcp_tools.json.
 *
 * Tool descriptions ARE prompts: an external LLM (Claude, ChatGPT…) picks a tool
 * purely from them. The tool-selection evals (`python -m evals.run_evals --suite mcp_tools`)
 * run against this snapshot, and CI runs `--check`, so a tool change can't merge
 * without refreshing the snapshot — which is the reminder to re-run those evals.
 *
 *   node scripts/mcp-tools-snapshot.mjs --user <userId> [--url …] [--check]
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
}

const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const check = argv.includes("--check");
if (!args.user) { console.error("--user <userId> is required"); process.exit(1); }
const OUT = "agent-service/evals/mcp_tools.json";

const token = execFileSync("node", ["scripts/mcp-dev-token.mjs", "--user", args.user, "--scopes",
  "candidates:read screening:run interviews:write"], { encoding: "utf8" }).trim();
const client = new Client({ name: "resume-ai-tools-snapshot", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
await client.connect(new StreamableHTTPClientTransport(new URL(args.url ?? "http://localhost:3100/api/mcp"),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const { tools } = await client.listTools();
await client.close();

const snapshot = JSON.stringify(
  tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  null, 2) + "\n";

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== snapshot) {
    console.error(`${OUT} is out of date — the MCP tool definitions changed.\n` +
      "Run `node scripts/mcp-tools-snapshot.mjs --user <id>`, commit it, and re-run `python -m evals.run_evals --suite mcp_tools`.");
    process.exit(1);
  }
  console.log(`${OUT} matches the server (${tools.length} tools).`);
} else {
  writeFileSync(OUT, snapshot);
  console.log(`wrote ${OUT} (${tools.length} tools)`);
}
