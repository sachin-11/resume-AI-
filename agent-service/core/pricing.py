"""
Token prices, $ per 1M tokens — mirrors lib/pricing.ts on the Next.js side.

Used for per-run cost budgets and cost alerts. Keep the two tables in sync when
a provider changes its rates or a new model is pinned in releases.json.
"""

MODEL_PRICING: dict[str, tuple[float, float]] = {
    "llama-3.3-70b-versatile": (0.59, 0.79),   # Groq
    "gpt-4o-mini": (0.15, 0.60),               # OpenAI
}

# Unknown models are priced like the most expensive known one, so a budget can
# only trip early, never silently let an unpriced model run up a bill.
_UNKNOWN = max(MODEL_PRICING.values(), key=lambda p: p[0] + p[1])


def _pricing_for(model: str) -> tuple[float, float]:
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]
    # Providers report dated snapshots ("gpt-4o-mini-2024-07-18"); longest prefix wins.
    base = max((k for k in MODEL_PRICING if model.startswith(k)), key=len, default=None)
    return MODEL_PRICING[base] if base else _UNKNOWN


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    inp, out = _pricing_for(model)
    return (input_tokens * inp + output_tokens * out) / 1_000_000
