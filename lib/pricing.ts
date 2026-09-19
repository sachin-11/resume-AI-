/**
 * AI token pricing — used to estimate cost per call for the admin cost dashboard.
 * Prices are $ per 1M tokens (public list pricing); update here if a provider changes rates.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 }, // Groq
  "gpt-4o-mini": { input: 0.15, output: 0.60 },             // OpenAI fallback
};

const DEFAULT_PRICING = { input: 0, output: 0 };

export function calcCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const rate = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output;
}
