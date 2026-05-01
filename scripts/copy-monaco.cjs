/**
 * Copy monaco-editor's bundled `vs` assets into public/ so workers load same-origin
 * (fixes Web Worker init errors with CDN / bundlers).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(root, "public", "monaco", "vs");

if (!fs.existsSync(src)) {
  console.warn("[copy-monaco] Skip: node_modules/monaco-editor/min/vs not found.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
try {
  fs.rmSync(dest, { recursive: true, force: true });
} catch {
  /* noop */
}
fs.cpSync(src, dest, { recursive: true });
console.log("[copy-monaco] Copied → public/monaco/vs");
