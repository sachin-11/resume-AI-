/**
 * OAuth consent screen for MCP clients (login required — see proxy.ts).
 * Shows exactly who is asking (client name, where its identity comes from, the host the
 * answer is sent to — with a warning for localhost-only clients, which anyone can claim)
 * and what they get (each scope in plain words).
 */
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { SCOPES } from "@/lib/mcp/auth";
import { verifyPending } from "@/lib/oauth/server";
import { isLoopbackRedirect } from "@/lib/oauth/clients";
import { ConsentButtons } from "./consent-buttons";

export const dynamic = "force-dynamic";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const { request } = await searchParams;
  let pending;
  try {
    pending = request ? await verifyPending(request) : null;
  } catch {
    pending = null;
  }
  if (!pending || !request) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-sm">
        <h1 className="mb-2 text-lg font-semibold">This request has expired</h1>
        <p className="text-muted-foreground">Go back to your AI assistant and connect again.</p>
      </main>
    );
  }

  const redirectHost = new URL(pending.redirectUri).host;
  const identity = pending.clientKind === "cimd"
    ? `Identity published at ${new URL(pending.clientId).host}`
    : "Self-registered client (identity not verified)";
  const localOnly = isLoopbackRedirect(pending.redirectUri);

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-violet-400" />
          {pending.clientName} wants to access your Resume AI account
        </h1>
        <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
          <div><dt className="inline">Client: </dt><dd className="inline font-mono">{pending.clientId}</dd></div>
          <div><dt className="inline">Who they are: </dt><dd className="inline">{identity}</dd></div>
          <div><dt className="inline">Access will be sent to: </dt><dd className="inline font-mono font-semibold text-foreground">{redirectHost}</dd></div>
        </dl>

        {localOnly && (
          <p className="mt-4 flex gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This app runs on your own computer (localhost). Any program on this computer could use that address —
            only continue if you just started connecting {pending.clientName} yourself.
          </p>
        )}

        <h2 className="mt-5 text-sm font-medium">It will be able to:</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {pending.scopes.map((s) => (
            <li key={s} className="rounded-md border border-border px-3 py-2">
              <span className="font-mono text-xs text-muted-foreground">{s}</span>
              <p>{SCOPES[s]}</p>
            </li>
          ))}
          {pending.offline && (
            <li className="rounded-md border border-border px-3 py-2">
              <span className="font-mono text-xs text-muted-foreground">offline_access</span>
              <p>Stay connected for up to 30 days without asking again (you can disconnect any time).</p>
            </li>
          )}
        </ul>

        <ConsentButtons request={request} clientName={pending.clientName} />
        <p className="mt-4 text-xs text-muted-foreground">
          It acts as you, only within these permissions. Booking interviews always asks you to confirm first.
        </p>
      </div>
    </main>
  );
}
