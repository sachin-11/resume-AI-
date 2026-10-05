/**
 * Mirror agent-service token usage into AiUsageLog so the admin cost dashboard
 * covers LangGraph agent runs too. agent-service returns `usage` (per-model token
 * totals for the whole run, sub-agents included) on every agent endpoint; the
 * per-call trace itself already lives in Langfuse.
 */
import { db } from "@/lib/db";
import { calcCostUsd } from "@/lib/pricing";

interface ModelUsage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

export interface AgentUsage {
  by_model?: Record<string, ModelUsage>;
}

/** Fire-and-forget, like logAiUsage — never blocks or fails the response. */
export function logAgentUsage(usage: AgentUsage | undefined, ctx: { userId?: string; feature: string }): void {
  const rows = Object.entries(usage?.by_model ?? {}).map(([model, u]) => ({
    userId: ctx.userId,
    feature: ctx.feature,
    provider: /^(gpt|o\d)/.test(model) ? "openai" : "groq",
    model,
    promptTokens: u.input_tokens,
    completionTokens: u.output_tokens,
    totalTokens: u.input_tokens + u.output_tokens,
    costUsd: calcCostUsd(model, u.input_tokens, u.output_tokens),
  }));
  if (rows.length === 0) return;

  void db.aiUsageLog.createMany({ data: rows }).catch((err) => console.error("[AI_USAGE_LOG]", err));
}
