"""
Central settings for the agent service.

Every env var the LLM layer depends on is read here, once, instead of scattered
`os.getenv` calls inside individual agents.
"""
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    openai_api_key: Optional[str]
    groq_api_key: Optional[str]

    # Model per provider per tier. "fast" = routing / judging / scoring,
    # "reasoning" = generation and analysis. Defaults keep today's models.
    openai_fast_model: str
    openai_reasoning_model: str
    groq_fast_model: str
    groq_reasoning_model: str

    llm_timeout_s: int
    llm_max_retries: int          # per-provider retries on 429 / 5xx / timeouts
    llm_structured_attempts: int  # re-asks when the reply fails schema validation

    @property
    def providers(self) -> list[str]:
        """Configured providers in priority order (first = primary, rest = fallbacks)."""
        order = []
        if self.openai_api_key:
            order.append("openai")
        if self.groq_api_key:
            order.append("groq")
        return order


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY") or None,
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
        openai_fast_model=os.getenv("OPENAI_FAST_MODEL", "gpt-4o-mini"),
        openai_reasoning_model=os.getenv("OPENAI_REASONING_MODEL", "gpt-4o-mini"),
        groq_fast_model=os.getenv("GROQ_FAST_MODEL", "llama-3.3-70b-versatile"),
        groq_reasoning_model=os.getenv("GROQ_REASONING_MODEL", "llama-3.3-70b-versatile"),
        llm_timeout_s=_int_env("LLM_TIMEOUT_S", 60),
        llm_max_retries=_int_env("LLM_MAX_RETRIES", 2),
        llm_structured_attempts=max(1, _int_env("LLM_STRUCTURED_ATTEMPTS", 2)),
    )
