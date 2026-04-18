/**
 * AI Provider with fallback:
 * Primary  → OpenAI (gpt-4o-mini) — if OPENAI_API_KEY is set
 * Fallback → Groq (llama-3.3-70b) — if OpenAI quota exceeded or unavailable
 */

import Groq from "groq-sdk";
import nodemailer from "nodemailer";

const GROQ_TIMEOUT_MS = 30_000;

// ── Alert throttle — send email max once per hour ────────────────
let lastAlertSentAt = 0;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function sendQuotaAlert() {
  const now = Date.now();
  if (now - lastAlertSentAt < ALERT_COOLDOWN_MS) return; // already sent recently
  lastAlertSentAt = now;

  const adminEmail = process.env.SMTP_USER;
  if (!adminEmail || !process.env.SMTP_PASS) return;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: adminEmail,
        pass: process.env.SMTP_PASS?.replace(/\s/g, "").trim(),
      },
    });

    await transporter.sendMail({
      from: `"AI Resume Coach Alert" <${adminEmail}>`,
      to: adminEmail,
      subject: "⚠️ OpenAI Quota Exceeded — Switched to Groq Fallback",
      html: `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e2e8f0;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:32px;">
    <div style="font-size:40px;text-align:center;margin-bottom:16px">⚠️</div>
    <h2 style="color:#eab308;margin:0 0 8px;text-align:center">OpenAI Quota Exceeded</h2>
    <p style="color:#94a3b8;text-align:center;margin:0 0 24px">Your AI Resume Coach platform has switched to the Groq fallback model.</p>
    
    <div style="background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="color:#64748b;font-size:12px;margin:0 0 4px">Time detected</p>
      <p style="color:#e2e8f0;font-size:14px;font-weight:600;margin:0">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
    </div>

    <div style="background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:16px;margin-bottom:24px">
      <p style="color:#64748b;font-size:12px;margin:0 0 8px">Current Status</p>
      <p style="color:#ef4444;font-size:13px;margin:0 0 4px">🔴 OpenAI — Quota exceeded</p>
      <p style="color:#22c55e;font-size:13px;margin:0">🟢 Groq fallback — Active</p>
    </div>

    <p style="color:#94a3b8;font-size:13px;margin:0 0 16px">The platform is still working normally using Groq. However, to restore OpenAI quality, please recharge your OpenAI credits.</p>

    <a href="https://platform.openai.com/settings/organization/billing/overview" 
       style="display:block;background:#7c3aed;color:#fff;text-decoration:none;text-align:center;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:16px">
      💳 Recharge OpenAI Credits
    </a>

    <p style="color:#475569;font-size:11px;text-align:center;margin:0">
      This alert will not repeat for 1 hour. Sent by AI Resume Coach monitoring.
    </p>
  </div>
</body>
</html>`,
    });

    console.log("[AI] Quota alert email sent to", adminEmail);
  } catch (err) {
    console.error("[AI] Failed to send quota alert email:", err);
  }
}

// ── OpenAI call ──────────────────────────────────────────────────
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model = "gpt-4o-mini"
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const code = err?.error?.code ?? "";
    // Throw specific error so fallback can detect quota exceeded
    throw Object.assign(new Error(err?.error?.message ?? `OpenAI error ${res.status}`), { code, status: res.status });
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Groq call ────────────────────────────────────────────────────
let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

async function callGroqDirect(
  systemPrompt: string,
  userPrompt: string,
  model = "llama-3.3-70b-versatile"
): Promise<string> {
  const timer = setTimeout(() => {}, GROQ_TIMEOUT_MS);
  try {
    const completion = await getGroq().chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });
    return completion.choices[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Quota / rate-limit error detection ──────────────────────────
function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { code?: string; status?: number };
  return (
    e.code === "insufficient_quota" ||
    e.code === "rate_limit_exceeded" ||
    e.status === 429 ||
    e.status === 402 ||
    e.message?.toLowerCase().includes("quota") ||
    e.message?.toLowerCase().includes("rate limit")
  );
}

// ── Main export: OpenAI first, Groq fallback ─────────────────────
export async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  _model = "llama-3.3-70b-versatile" // kept for API compatibility
): Promise<string> {
  // Try OpenAI first if key is available
  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await callOpenAI(systemPrompt, userPrompt);
      return result;
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn("[AI] OpenAI quota exceeded — falling back to Groq");
        sendQuotaAlert(); // non-blocking email alert
      } else {
        console.warn("[AI] OpenAI failed, falling back to Groq:", (err as Error).message);
      }
      // Fall through to Groq
    }
  }

  // Groq fallback
  if (!process.env.GROQ_API_KEY) {
    throw new Error("No AI provider configured. Set OPENAI_API_KEY or GROQ_API_KEY.");
  }
  return callGroqDirect(systemPrompt, userPrompt);
}

// Stream version (used by some routes)
export async function callGroqStream(
  systemPrompt: string,
  userPrompt: string,
  model = "llama-3.3-70b-versatile"
) {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
  return getGroq().chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  });
}
