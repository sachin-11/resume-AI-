"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brain, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function CandidateLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillEmail = params.get("email") ?? "";
  const prefillToken = params.get("token") ?? "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email) return;
    setLoading(true); setError("");

    const res = await fetch("/api/candidate/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        ...(prefillToken ? { token: prefillToken } : { password }),
      }),
    });

    const data = await res.json();
    if (res.ok) {
      router.push("/candidate/portal");
    } else {
      setError(data.error ?? "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="font-bold">AI Resume Coach</p>
            <p className="text-xs text-muted-foreground">Candidate Portal</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Candidate Login</CardTitle>
            <CardDescription>
              {prefillToken
                ? "Your email is pre-filled from the invite link."
                : "Enter your email and password to view your interview results."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!prefillToken}
              />
            </div>

            {!prefillToken && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                <p className="text-xs text-muted-foreground">
                  Password was sent in your interview invite email.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button className="w-full" onClick={handleLogin} disabled={!email || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {prefillToken ? "Access My Results" : "Login"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
