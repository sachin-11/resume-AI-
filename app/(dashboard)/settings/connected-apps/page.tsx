"use client";
import { useEffect, useState } from "react";
import { Loader2, Plug, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Connection {
  id: string;
  clientName: string;
  clientId: string;
  scopes: string[];
  connectedAt: string;
  lastRefreshedAt: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** AI apps (MCP clients) the recruiter connected through OAuth — and the off switch for each. */
export default function ConnectedAppsPage() {
  const [items, setItems] = useState<Connection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    fetch("/api/oauth/connections").then(async (r) => (r.ok ? setItems((await r.json()).connections) : setError("Could not load.")));
  useEffect(() => { void load(); }, []);

  async function disconnect(id: string) {
    setBusy(id);
    const r = await fetch(`/api/oauth/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok) setError("Could not disconnect.");
    await load();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Plug className="h-6 w-6 text-violet-400" /> Connected AI apps</h1>
        <p className="mt-1 text-muted-foreground">
          AI assistants (MCP clients such as Claude Desktop) you allowed to work with your candidates. Disconnecting stops them
          from getting new access; access already issued ends within an hour.
        </p>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!items && !error && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {items?.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No AI apps are connected.</CardContent></Card>
      )}
      {items?.map((c) => (
        <Card key={c.id}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">{c.clientName}</CardTitle>
              <CardDescription className="font-mono text-xs">{c.clientId}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => disconnect(c.id)} disabled={busy === c.id} className="gap-1.5">
              {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Disconnect
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-1">{c.scopes.map((s) => <Badge key={s} variant="secondary" className="font-mono text-[11px]">{s}</Badge>)}</div>
            <p className="text-xs text-muted-foreground">Connected {fmt(c.connectedAt)} · last active {fmt(c.lastRefreshedAt)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
