/**
 * AI token pricing — used to estimate cost per call for the admin cost dashboard.
 * Prices are $ per 1M tokens (public list pricing); update here if a provider changes rates.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 }, // Groq
  "gpt-4o-mini": { input: 0.15, output: 0.60 },             // OpenAI fallback
};

const DEFAULT_PRICING = { input: 0, output: 0 };

// Providers report dated snapshots ("gpt-4o-mini-2024-07-18"); match those to
// their base entry by longest prefix.
function pricingFor(model: string) {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const base = Object.keys(MODEL_PRICING)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return base ? MODEL_PRICING[base] : DEFAULT_PRICING;
}

export function calcCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const rate = pricingFor(model);
  return (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output;
}
