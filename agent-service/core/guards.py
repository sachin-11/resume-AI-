"""
Hard limits on a single agent run — so a looping or runaway agent costs a bounded
amount of time and money, and a broken agent fails fast instead of on every request.

Per run (enforced by run_agent):
  - timeout_s:        wall-clock limit for the whole graph (sub-agents included).
  - recursion_limit:  max LangGraph super-steps — the loop guard for cyclic graphs.
  - max_tokens / max_cost_usd: token and $ budget across every LLM call in the run.
    Checked before each call (an over-budget run makes no further calls) and after
    each call. Nodes that catch exceptions and fall back can't hide a blown budget:
    run_agent re-checks the guard when the graph returns.

Per agent:
  - a circuit breaker: after AGENT_BREAKER_THRESHOLD consecutive failed runs the
    agent is refused for AGENT_BREAKER_COOLDOWN_S, then one trial run is let through.

Retries with backoff on provider errors live in the LLM gateway (core/llm.py).

Defaults suit a single-candidate run; fan-out agents get larger limits below.
Override per environment with AGENT_RUN_TIMEOUT_S / AGENT_RUN_MAX_TOKENS /
AGENT_RUN_MAX_COST_USD, or per agent with AGENT_LIMITS='{"bulk-screening": {"max_cost_usd": 5}}'.
"""
import json
import logging
import os
from dataclasses import dataclass, replace
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler

from core.pricing import cost_usd
from core.release import family
from core.tools import CircuitBreaker

logger = logging.getLogger("agent.guards")


class AgentRunError(RuntimeError):
    """A run stopped by a guard. `code` is stable for clients and metrics."""
    code = "agent_error"
    status_code = 500


class BudgetExceeded(AgentRunError):
    code = "budget_exceeded"
    status_code = 422


class RunTimeout(AgentRunError):
    code = "timeout"
    status_code = 504


class LoopLimit(AgentRunError):
    code = "loop_limit"
    status_code = 422


class AgentUnavailable(AgentRunError):
    """Refused before running: circuit open, or switched off / read-only by a flag."""
    code = "agent_unavailable"
    status_code = 503


# ── Limits ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class RunLimits:
    timeout_s: float
    max_tokens: int
    max_cost_usd: float
    recursion_limit: int


def _default() -> RunLimits:
    return RunLimits(
        timeout_s=float(os.getenv("AGENT_RUN_TIMEOUT_S", "150")),
        max_tokens=int(os.getenv("AGENT_RUN_MAX_TOKENS", "150000")),
        max_cost_usd=float(os.getenv("AGENT_RUN_MAX_COST_USD", "0.50")),
        recursion_limit=int(os.getenv("AGENT_RUN_RECURSION_LIMIT", "40")),
    )


# Fan-out agents: up to 50 resumes / 100 candidates in one run (jobs time out at 600s).
_PER_AGENT = {
    "bulk-screening": {"timeout_s": 540, "max_tokens": 2_000_000, "max_cost_usd": 3.0},
    "hiring-committee": {"timeout_s": 540, "max_tokens": 1_000_000, "max_cost_usd": 2.0},
    "auto-apply": {"timeout_s": 240},
}


def limits_for(agent: str) -> RunLimits:
    overrides = dict(_PER_AGENT.get(family(agent), {}))
    try:
        overrides.update(json.loads(os.getenv("AGENT_LIMITS", "{}")).get(family(agent), {}))
    except (ValueError, AttributeError):
        logger.error("AGENT_LIMITS is not valid JSON — ignoring it")
    return replace(_default(), **overrides)


# ── Budget ───────────────────────────────────────────────────────

class BudgetGuard(BaseCallbackHandler):
    """Counts tokens and $ for one run; raises BudgetExceeded once over either limit."""

    raise_error = True   # let the exception abort the LLM call instead of being logged and swallowed

    def __init__(self, limits: RunLimits) -> None:
        self.limits = limits
        self.tokens = 0
        self.cost_usd = 0.0
        self.tripped = False

    def _check(self) -> None:
        if self.tokens > self.limits.max_tokens or self.cost_usd > self.limits.max_cost_usd:
            self.tripped = True
            raise BudgetExceeded(
                f"Run budget exceeded: {self.tokens} tokens / ${self.cost_usd:.4f} "
                f"(limits {self.limits.max_tokens} tokens / ${self.limits.max_cost_usd:.4f})"
            )

    def on_chat_model_start(self, serialized: Any, messages: Any, **kwargs: Any) -> None:
        self._check()

    def on_llm_start(self, serialized: Any, prompts: Any, **kwargs: Any) -> None:
        self._check()

    def on_llm_end(self, response, **kwargs: Any) -> None:
        for generations in response.generations:
            for gen in generations:
                message = getattr(gen, "message", None)
                usage = getattr(message, "usage_metadata", None) or {}
                model = (getattr(message, "response_metadata", None) or {}).get("model_name", "unknown")
                inp, out = usage.get("input_tokens", 0) or 0, usage.get("output_tokens", 0) or 0
                self.tokens += inp + out
                self.cost_usd += cost_usd(model, inp, out)
        self._check()


# ── Per-agent circuit breaker ────────────────────────────────────

_breakers: dict[str, CircuitBreaker] = {}


def breaker(agent: str) -> CircuitBreaker:
    name = family(agent)
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(
            threshold=int(os.getenv("AGENT_BREAKER_THRESHOLD", "5")),
            cooldown_s=float(os.getenv("AGENT_BREAKER_COOLDOWN_S", "60")),
        )
    return _breakers[name]


def ensure_circuit_closed(agent: str) -> None:
    if breaker(agent).is_open:
        raise AgentUnavailable(f"Agent '{family(agent)}' is paused after repeated failures — retry in a minute.")


def breaker_states() -> dict[str, str]:
    return {name: ("open" if b.is_open else "closed") for name, b in _breakers.items()}
