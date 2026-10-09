"""
LLM gateway — the one place agents get a model from.

What it adds over constructing ChatOpenAI/ChatGroq directly:
  - Per-call provider fallback: if the primary provider errors (after its own
    retries), the same request is retried on the next configured provider.
  - Retries with backoff on 429 / 5xx / timeouts, and a request timeout.
  - A client-side rate limiter per provider (GROQ_MAX_RPS / OPENAI_MAX_RPS), so
    bursts queue up locally instead of hitting the provider's limit.
  - Model tiers ("fast" for routing/judging, "reasoning" for generation).
  - Canary: a run picked for the canary (core/release.py) gets the canary
    models from releases.json instead of the pinned ones.
  - Structured output: replies are parsed and validated against a Pydantic
    schema; an invalid reply is sent back to the model once with the error,
    and only after that does the caller's fallback get used — with
    `fallback_used=True` so the caller can flag the result instead of passing
    a made-up default off as a real AI judgement.
"""
import json
import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Generic, Literal, Optional, Sequence, TypeVar, Union

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import Runnable
from pydantic import BaseModel

from core import release
from core.config import get_settings

logger = logging.getLogger("agent.llm")

Tier = Literal["fast", "reasoning"]
Prompt = Union[str, Sequence[BaseMessage]]
T = TypeVar("T", bound=BaseModel)


class NoLLMProviderError(RuntimeError):
    pass


@lru_cache(maxsize=4)
def _rate_limiter(provider: str):
    """One limiter per provider, shared by every model instance (all tiers/temperatures)."""
    rps = get_settings().openai_max_rps if provider == "openai" else get_settings().groq_max_rps
    if rps <= 0:
        return None
    from langchain_core.rate_limiters import InMemoryRateLimiter
    # Small burst allowance, then a steady `rps`.
    return InMemoryRateLimiter(requests_per_second=rps, check_every_n_seconds=0.05, max_bucket_size=max(1, rps * 5))


def _build_model(provider: str, tier: Tier, temperature: float, variant: str = "stable") -> BaseChatModel:
    s = get_settings()
    canary = release.canary_model(f"{provider}_{tier}") if variant == "canary" else None
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        model = canary or (s.openai_fast_model if tier == "fast" else s.openai_reasoning_model)
        return ChatOpenAI(
            model=model, temperature=temperature, api_key=s.openai_api_key,
            timeout=s.llm_timeout_s, max_retries=s.llm_max_retries, rate_limiter=_rate_limiter("openai"),
        )
    from langchain_groq import ChatGroq
    model = canary or (s.groq_fast_model if tier == "fast" else s.groq_reasoning_model)
    return ChatGroq(
        model=model, temperature=temperature, api_key=s.groq_api_key,
        timeout=s.llm_timeout_s, max_retries=s.llm_max_retries, rate_limiter=_rate_limiter("groq"),
    )


def get_llm(temperature: float = 0.3, tier: Tier = "reasoning") -> Runnable:
    """Chat model for `tier`, with every other configured provider as a fallback."""
    return _get_llm(temperature, tier, release.variant_var.get())


@lru_cache(maxsize=32)
def _get_llm(temperature: float, tier: Tier, variant: str) -> Runnable:
    providers = get_settings().providers
    if not providers:
        raise NoLLMProviderError("No LLM provider configured — set OPENAI_API_KEY and/or GROQ_API_KEY")

    primary, *rest = [_build_model(p, tier, temperature, variant) for p in providers]
    return primary.with_fallbacks(rest) if rest else primary


# ── Parsing ──────────────────────────────────────────────────────

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def message_text(response) -> str:
    return response.content if hasattr(response, "content") else str(response)


def extract_json(text: str):
    """Pull the JSON value out of a model reply (code fences / surrounding prose tolerated).

    Raises ValueError if nothing parseable is found.
    """
    text = text.strip()
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
    end = max(text.rfind("}"), text.rfind("]"))
    if starts and end > min(starts):
        return json.loads(text[min(starts):end + 1])
    raise ValueError("No JSON found in model reply")


def safe_json_parse(text: str, fallback):
    """Legacy helper: parsed JSON, or `fallback` if the reply has none.
    New code should use `ainvoke_structured` with a Pydantic schema instead."""
    try:
        return extract_json(text)
    except Exception:
        return fallback


# ── Structured invocation ────────────────────────────────────────

@dataclass
class StructuredResult(Generic[T]):
    data: T
    fallback_used: bool = False
    error: Optional[str] = None


def _as_messages(prompt: Prompt) -> list[BaseMessage]:
    return [HumanMessage(content=prompt)] if isinstance(prompt, str) else list(prompt)


def _parse(schema: type[T], response) -> T:
    return schema.model_validate(extract_json(message_text(response)))


def _repair_turn(response, error: str) -> list[BaseMessage]:
    return [
        AIMessage(content=message_text(response)),
        HumanMessage(content=(
            f"That reply could not be used: {error}\n"
            "Reply again with ONLY the JSON object in the requested format — no prose, no code fences."
        )),
    ]


def _short_error(err: Exception) -> str:
    return str(err).replace("\n", " ")[:400]


def _log_usage(name: str, response) -> None:
    usage = getattr(response, "usage_metadata", None) or {}
    model = (getattr(response, "response_metadata", None) or {}).get("model_name", "?")
    logger.info(
        "llm_call name=%s model=%s input_tokens=%s output_tokens=%s",
        name, model, usage.get("input_tokens"), usage.get("output_tokens"),
    )


def _give_up(name: str, schema: type[T], fallback: T, error: Optional[str]) -> StructuredResult[T]:
    logger.warning("llm_structured_fallback name=%s schema=%s error=%s", name, schema.__name__, error)
    return StructuredResult(data=fallback, fallback_used=True, error=error)


async def ainvoke_structured(
    prompt: Prompt,
    schema: type[T],
    *,
    fallback: T,
    tier: Tier = "reasoning",
    temperature: float = 0.3,
    name: str = "unnamed",
) -> StructuredResult[T]:
    """Call the LLM and return its reply validated against `schema`.

    Provider/network errors that survive retries + provider fallback are raised,
    not hidden behind `fallback` — an outage should surface as an error.
    """
    llm = get_llm(temperature=temperature, tier=tier)
    messages = _as_messages(prompt)
    error = None
    for _ in range(get_settings().llm_structured_attempts):
        response = await llm.ainvoke(messages)
        _log_usage(name, response)
        try:
            return StructuredResult(data=_parse(schema, response))
        except ValueError as e:  # JSONDecodeError and pydantic ValidationError are both ValueErrors
            error = _short_error(e)
            messages = messages + _repair_turn(response, error)
    return _give_up(name, schema, fallback, error)


def invoke_structured(
    prompt: Prompt,
    schema: type[T],
    *,
    fallback: T,
    tier: Tier = "reasoning",
    temperature: float = 0.3,
    name: str = "unnamed",
) -> StructuredResult[T]:
    """Sync twin of `ainvoke_structured`, for sync graph nodes."""
    llm = get_llm(temperature=temperature, tier=tier)
    messages = _as_messages(prompt)
    error = None
    for _ in range(get_settings().llm_structured_attempts):
        response = llm.invoke(messages)
        _log_usage(name, response)
        try:
            return StructuredResult(data=_parse(schema, response))
        except ValueError as e:
            error = _short_error(e)
            messages = messages + _repair_turn(response, error)
    return _give_up(name, schema, fallback, error)
