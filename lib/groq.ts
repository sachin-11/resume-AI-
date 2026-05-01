/**
 * AI Provider — Groq Primary, OpenAI Fallback
 *
 * Strategy:
 * 1. Groq (llama-3.3-70b) — Primary, free tier, fast
 * 2. OpenAI (gpt-4o-mini)  — Fallback when Groq limit hits
 *
 * Zero interview interruption — seamless switch mid-session.
 */

import Groq from "groq-sdk";
import nodemailer from "nodemailer";

const TIMEOUT_MS = 30_000;

// ── Provider state tracking ──────────────────────────────────────
// Track which provider is currently active so we don't keep retrying failed one
let groqUnavailableUntil = 0;        // timestamp — skip Groq until this time
const GROQ_COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown after Groq fails

// ── Alert throttle ───────────────────────────────────────────────
let lastAlertSentAt = 0;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function sendSwitchAlert(from: string, to: string, reason: string) {
  const now = Date.now();
  if (now - lastAlertSentAt < ALERT_COOLDOWN_MS) return;
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
      subject: `⚡ AI Provider Switch: ${from} → ${to}`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e2e8f0;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:32px;">
    <div style="font-size:40px;text-align:center;margin-bottom:16px">⚡</div>
    <h2 style="color:#eab308;margin:0 0 8px;text-align:center">AI Provider Switched</h2>
    <p style="color:#94a3b8;text-align:center;margin:0 0 24px">Automatic failover — no interview interruption.</p>
    <div style="background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="color:#64748b;font-size:12px;margin:0 0 4px">Switch</p>
      <p style="color:#e2e8f0;font-size:14px;font-weight:600;margin:0">${from} → ${to}</p>
    </div>
    <div style="background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="color:#64748b;font-size:12px;margin:0 0 4px">Reason</p>
      <p style="color:#e2e8f0;font-size:14px;margin:0">${reason}</p>
    </div>
    <div style="background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="color:#64748b;font-size:12px;margin:0 0 4px">Time</p>
      <p style="color:#e2e8f0;font-size:14px;font-weight:600;margin:0">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
    </div>
    <div style="background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:16px;">
      <p style="color:#22c55e;font-size:13px;margin:0">✅ Platform is running normally on ${to}</p>
    </div>
  </div>
</body></html>`,
    });
    console.log(`[AI] Switch alert sent: ${from} → ${to}`);
  } catch (err) {
    console.error("[AI] Failed to send switch alert:", err);
  }
}

// ── Error classification ─────────────────────────────────────────
function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { code?: string; status?: number };
  return (
    e.code === "rate_limit_exceeded" ||
    e.code === "insufficient_quota" ||
    e.code === "tokens_exceeded" ||
    e.status === 429 ||
    e.status === 402 ||
    /rate.?limit|quota|too many|exceeded|limit reached/i.test(e.message ?? "")
  );
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { status?: number };
  return (
    e.status === 500 ||
    e.status === 502 ||
    e.status === 503 ||
    e.status === 504 ||
    /timeout|network|ECONNREFUSED|ENOTFOUND|fetch/i.test(e.message ?? "")
  );
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const code = err?.error?.code ?? "";
    throw Object.assign(
      new Error(err?.error?.message ?? `OpenAI error ${res.status}`),
      { code, status: res.status }
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Main export: Groq first, OpenAI fallback ─────────────────────
export async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  _model = "llama-3.3-70b-versatile"
): Promise<string> {
  const now = Date.now();
  const groqAvailable = process.env.GROQ_API_KEY && now > groqUnavailableUntil;
  const openaiAvailable = !!process.env.OPENAI_API_KEY;

  // ── Try Groq first (primary) ─────────────────────────────────
  if (groqAvailable) {
    try {
      const result = await callGroqDirect(systemPrompt, userPrompt);
      return result;
    } catch (err) {
      const reason = (err as Error).message ?? "Unknown error";

      if (isRateLimitError(err)) {
        // Groq rate limit — cooldown and switch to OpenAI
        groqUnavailableUntil = Date.now() + GROQ_COOLDOWN_MS;
        console.warn(`[AI] Groq rate limit hit — switching to OpenAI for ${GROQ_COOLDOWN_MS / 60000} min`);
        sendSwitchAlert("Groq", "OpenAI", `Rate limit: ${reason}`); // non-blocking
      } else if (isTransientError(err)) {
        // Groq transient error — try OpenAI immediately
        console.warn("[AI] Groq transient error — trying OpenAI:", reason);
      } else {
        // Unknown Groq error — try OpenAI
        console.warn("[AI] Groq failed — trying OpenAI:", reason);
      }
      // Fall through to OpenAI
    }
  }

  // ── Fallback: OpenAI ─────────────────────────────────────────
  if (openaiAvailable) {
    try {
      const result = await callOpenAI(systemPrompt, userPrompt);

      // If we were using OpenAI as fallback, log it
      if (groqAvailable === false || now <= groqUnavailableUntil) {
        console.log("[AI] OpenAI fallback successful");
      }

      return result;
    } catch (err) {
      const reason = (err as Error).message ?? "Unknown error";
      console.error("[AI] OpenAI also failed:", reason);

      // Both failed — if Groq cooldown is active, try Groq one more time
      if (process.env.GROQ_API_KEY && now <= groqUnavailableUntil) {
        console.warn("[AI] Both failed — retrying Groq as last resort");
        groqUnavailableUntil = 0; // reset cooldown
        try {
          return await callGroqDirect(systemPrompt, userPrompt);
        } catch (groqErr) {
          console.error("[AI] Groq last resort also failed:", (groqErr as Error).message);
        }
      }

      throw new Error(`All AI providers failed. Last error: ${reason}`);
    }
  }

  // ── No providers configured ──────────────────────────────────
  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("No AI provider configured. Set GROQ_API_KEY or OPENAI_API_KEY in .env");
  }

  // Only Groq configured but in cooldown — wait and retry
  if (process.env.GROQ_API_KEY && !openaiAvailable) {
    console.warn("[AI] Groq in cooldown, no OpenAI — retrying Groq");
    groqUnavailableUntil = 0;
    return callGroqDirect(systemPrompt, userPrompt);
  }

  throw new Error("AI provider unavailable. Please try again.");
}

// ── Stream version (for real-time responses) ─────────────────────
export async function callGroqStream(
  systemPrompt: string,
  userPrompt: string,
  model = "llama-3.3-70b-versatile"
) {
  // Stream always uses Groq (streaming with OpenAI needs different handling)
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured for streaming");
  }
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

// ── Provider status (for debugging/admin) ────────────────────────
export function getProviderStatus(): { primary: string; fallback: string; groqCooldown: boolean; cooldownEndsIn: number } {
  const now = Date.now();
  const groqInCooldown = now <= groqUnavailableUntil;
  return {
    primary: groqInCooldown ? "openai" : "groq",
    fallback: groqInCooldown ? "groq (cooling down)" : "openai",
    groqCooldown: groqInCooldown,
    cooldownEndsIn: groqInCooldown ? Math.round((groqUnavailableUntil - now) / 1000) : 0,
  };
}
