"use client";
import { useState, useRef, useEffect } from "react";
import { Loader2, Phone, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onVerified: (phone: string) => void;
}

export function PhoneOtpVerifier({ onVerified }: Props) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleSendOtp() {
    if (!phone) { setError("Enter your phone number"); return; }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error); return; }
    setStep("otp");
    setCountdown(60);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }

  async function handleVerify() {
    const code = otp.join("");
    if (code.length !== 6) { setError("Enter the 6-digit OTP"); return; }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error); return; }
    setStep("done");
    onVerified(phone);
  }

  function handleOtpInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    // Auto-verify when all 6 digits entered
    if (newOtp.every((d) => d) && newOtp.join("").length === 6) {
      setTimeout(() => handleVerifyCode(newOtp.join("")), 100);
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerifyCode(code: string) {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error); return; }
    setStep("done");
    onVerified(phone);
  }

  if (step === "done") {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
        <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-400">Phone verified!</p>
          <p className="text-xs text-muted-foreground">{phone}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === "phone" && (
        <div className="space-y-2">
          <Label>Phone Number</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="+919876543210"
                className="pl-9"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
              />
            </div>
            <Button onClick={handleSendOtp} disabled={loading || !phone}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Include country code, e.g. +91 for India</p>
        </div>
      )}

      {step === "otp" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Enter OTP</Label>
            <button
              onClick={() => { setStep("phone"); setOtp(["","","","","",""]); setError(""); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Change number
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Sent to <span className="text-foreground">{phone}</span></p>

          {/* 6-digit OTP boxes */}
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

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <Button
            className="w-full"
            onClick={handleVerify}
            disabled={loading || otp.some((d) => !d)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify OTP"}
          </Button>

          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-xs text-muted-foreground">Resend in {countdown}s</p>
            ) : (
              <button
                onClick={() => { setOtp(["","","","","",""]); setError(""); handleSendOtp(); }}
                className="flex items-center gap-1 text-xs text-violet-500 hover:underline mx-auto"
              >
                <RefreshCw className="h-3 w-3" /> Resend OTP
              </button>
            )}
          </div>
        </div>
      )}

      {step === "phone" && error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
