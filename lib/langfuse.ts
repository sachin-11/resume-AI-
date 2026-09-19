/**
 * Observability — Langfuse tracing (opt-in via env), mirrors agent-service's
 * agents/shared/observability.py so both services report to the same project.
 *
 * If LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are not set, every call here is
 * a no-op so nothing depends on Langfuse being configured.
 */
import { Langfuse } from "langfuse";

let _langfuse: Langfuse | null = null;
let _checked = false;

function getLangfuse(): Langfuse | null {
  if (_checked) return _langfuse;
  _checked = true;

  if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
    try {
      _langfuse = new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com",
      });
    } catch (err) {
      console.error("[OBSERVABILITY] Langfuse init failed:", err);
      _langfuse = null;
    }
  }
  return _langfuse;
}

export interface LlmGenerationLog {
  name: string;
  model: string;
  input: string;
  output: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log one LLM call as a Langfuse generation. Always safe to call — no-ops if unconfigured.
 * Awaits the flush so serverless functions (Vercel) don't get frozen mid-upload after responding.
 */
export async function logGeneration(entry: LlmGenerationLog): Promise<void> {
  const lf = getLangfuse();
  if (!lf) return;
  try {
    const trace = lf.trace({
      name: entry.name,
      userId: entry.userId,
      sessionId: entry.sessionId,
      metadata: entry.metadata,
    });
    trace.generation({
      name: entry.name,
      model: entry.model,
      input: entry.input,
      output: entry.output,
      usage: {
        input: entry.usage.promptTokens,
        output: entry.usage.completionTokens,
        total: entry.usage.totalTokens,
        unit: "TOKENS",
      },
    });
    await lf.flushAsync();
  } catch (err) {
    console.error("[OBSERVABILITY] Langfuse trace failed:", err);
  }
}
