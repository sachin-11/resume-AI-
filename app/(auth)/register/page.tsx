"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brain, Loader2, Eye, EyeOff, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRef, useEffect } from "react";

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score, label: "Fair", color: "bg-yellow-500" };
  if (score <= 3) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

export default function RegisterPage() {
  const router = useRouter();

  // Step: "details" → "otp" → done
  const [step, setStep] = useState<"details" | "otp">("details");

  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = passwordStrength(form.password);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function validate(): string | null {
    if (!form.name.trim() || form.name.trim().length < 2) return "Name must be at least 2 characters";
    if (!form.email) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email address";
    if (!form.password || form.password.length < 8) return "Password must be at least 8 characters";
    if (!form.phone) return "Phone number is required";
    if (!/^\+[1-9]\d{7,14}$/.test(form.phone)) return "Enter phone with country code (e.g. +919876543210)";
    return null;
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  async function handleSendOtp() {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: form.phone }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error); return; }
    setStep("otp");
    setCountdown(60);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }

  function handleOtpInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newOtp.every((d) => d)) {
      setTimeout(() => handleRegister(newOtp.join("")), 100);
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleRegister(code: string) {
    setLoading(true);
    setError("");

    // 1. Verify OTP
    const otpRes = await fetch("/api/auth/otp/verify-only", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: form.phone, code }),
    });
    const otpData = await otpRes.json();
    if (!otpRes.ok) {
      setError(otpData.error);
      setLoading(false);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return;
    }

    // 2. Register user
    const regRes = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, phoneVerified: true }),
    });
    const regData = await regRes.json();
    if (!regRes.ok) {
      setError(regData.error ?? "Registration failed");
      setLoading(false);
      return;
    }

    // 3. Auto-login
    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (result?.ok) {
      router.push("/dashboard");
    } else {
      router.push("/login?registered=true");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600">
            <Brain className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Create Account</h1>
            <p className="text-muted-foreground text-sm">Start your interview prep journey</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{step === "details" ? "Get started for free" : "Verify your phone"}</CardTitle>
            <CardDescription>
              {step === "details"
                ? "Create your account to access all features"
                : `OTP sent to ${form.phone}`}
            </CardDescription>
          </CardHeader>
          <CardContent>

            {/* ── STEP 1: Details ── */}
            {step === "details" && (
              <>
                <Button type="button" variant="outline" className="w-full flex items-center gap-3 mb-4"
                  onClick={handleGoogle} disabled={googleLoading}>
                  {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Sign up with Google
                </Button>

                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {error && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
                  )}
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input placeholder="John Doe" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="you@example.com" value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Min. 8 characters"
                        value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.password.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          {[1,2,3,4].map((i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength.score ? strength.color : "bg-secondary"}`} />
                          ))}
                        </div>
                        <p className={`text-xs ${strength.score <= 1 ? "text-red-400" : strength.score <= 2 ? "text-yellow-400" : strength.score <= 3 ? "text-blue-400" : "text-green-400"}`}>
                          {strength.label} password
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="tel" placeholder="+919876543210" className="pl-9"
                        value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <p className="text-xs text-muted-foreground">Include country code · e.g. +91 for India</p>
                  </div>
                  <Button className="w-full" onClick={handleSendOtp} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {loading ? "Sending OTP…" : "Send OTP & Continue"}
                  </Button>
                </div>
              </>
            )}

            {/* ── STEP 2: OTP ── */}
            {step === "otp" && (
              <div className="space-y-5">
                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
                )}

                <div className="flex gap-2 justify-center">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpInput(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className={`w-11 h-12 text-center text-lg font-bold rounded-lg border bg-background transition-all outline-none
                        ${digit ? "border-violet-500 text-violet-400" : "border-input"}
                        focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20`}
                    />
                  ))}
                </div>

                <Button className="w-full" onClick={() => handleRegister(otp.join(""))}
                  disabled={loading || otp.some((d) => !d)}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? "Verifying…" : "Verify & Create Account"}
                </Button>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button onClick={() => { setStep("details"); setOtp(["","","","","",""]); setError(""); }}
                    className="hover:text-foreground">← Change details</button>
                  {countdown > 0 ? (
                    <span>Resend in {countdown}s</span>
                  ) : (
                    <button onClick={() => { setOtp(["","","","","",""]); setError(""); handleSendOtp(); }}
                      className="flex items-center gap-1 text-violet-500 hover:underline">
                      <RefreshCw className="h-3 w-3" /> Resend OTP
                    </button>
                  )}
                </div>
              </div>
            )}

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-violet-500 hover:underline font-medium">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
