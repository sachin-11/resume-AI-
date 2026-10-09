"""
Tool registry — every external call an agent makes goes through `call_tool`.

Each tool declares, once:
  - risk:    "read" for everything in agent-service today. Actions with side
             effects (booking, email) deliberately live in Next.js and only run
             after a human approves them (see the HITL gates).
  - agents:  which agents may call it (least privilege). A call from any other
             agent raises ToolNotAllowed instead of quietly working.
  - timeout: hard per-call limit.
and gets, uniformly:
  - a circuit breaker: after 3 consecutive failures the tool is skipped for 60s,
    so a dead dependency costs one fast error instead of a timeout per request;
  - a Langfuse "tool" span (content masked like every other span) and an audit
    event (core/audit.py: who, which agent, argument hash, outcome, duration).

LLM-facing tools (`tools_for`) also treat every result as untrusted input: the
text the model reads is size-capped (MAX_TOOL_OUTPUT_CHARS) and, unless the
agent renders it itself, fenced as data with wrap_untrusted.
"""
import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal, Optional

from langchain_core.tools import StructuredTool

from core import audit
from core.guardrails import wrap_untrusted

logger = logging.getLogger("agent.tools")

# Tool output (logs, search results, repo lists) can be huge and can carry
# injected instructions; cap what the model reads per call.
MAX_TOOL_OUTPUT_CHARS = int(os.getenv("MAX_TOOL_OUTPUT_CHARS", "6000"))

Risk = Literal["read"]


class ToolError(RuntimeError):
    pass


class ToolNotAllowed(ToolError):
    pass


class ToolUnavailable(ToolError):
    pass


@dataclass
class CircuitBreaker:
    threshold: int = 3
    cooldown_s: float = 60.0
    failures: int = 0
    opened_at: Optional[float] = None

    @property
    def is_open(self) -> bool:
        return self.opened_at is not None and time.monotonic() - self.opened_at < self.cooldown_s

    def record(self, ok: bool) -> None:
        if ok:
            self.failures, self.opened_at = 0, None
            return
        self.failures += 1
        if self.failures >= self.threshold:
            self.opened_at = time.monotonic()  # (re)open; after cooldown one trial call is let through


@dataclass
class ToolSpec:
    name: str
    description: str
    risk: Risk
    agents: frozenset
    timeout_s: float
    fn: Callable[..., Awaitable[Any]]
    breaker: CircuitBreaker = field(default_factory=CircuitBreaker)
    runnable: Optional[StructuredTool] = None


_REGISTRY: dict[str, ToolSpec] = {}


def tool(name: str, *, description: str, agents: set, risk: Risk = "read", timeout_s: float = 15.0):
    """Register an async function as a tool."""
    def register(fn):
        if name in _REGISTRY:
            raise ValueError(f"Tool '{name}' registered twice")
        spec = ToolSpec(name=name, description=description, risk=risk, agents=frozenset(agents),
                        timeout_s=timeout_s, fn=fn)
        # StructuredTool gives us LangChain callbacks → a tool span in the run's trace.
        spec.runnable = StructuredTool.from_function(coroutine=fn, name=name, description=description)
        _REGISTRY[name] = spec
        return fn
    return register


async def call_tool(name: str, *, agent: str, **arguments) -> Any:
    spec = _REGISTRY.get(name)
    audit_fields = {"tool": name, "agent": agent, "risk": spec.risk if spec else None,
                    "arg_names": sorted(arguments), "args_sha256": audit.fingerprint(arguments)}
    if spec is None:
        audit.record("tool_call", **audit_fields, outcome="unknown_tool")
        raise ToolError(f"Unknown tool '{name}'")
    if agent not in spec.agents:
        audit.record("tool_call", **audit_fields, outcome="denied")
        raise ToolNotAllowed(f"Agent '{agent}' may not call tool '{name}'")
    if spec.breaker.is_open:
        audit.record("tool_call", **audit_fields, outcome="circuit_open")
        raise ToolUnavailable(f"Tool '{name}' is temporarily disabled after repeated failures")

    started = time.perf_counter()
    try:
        result = await asyncio.wait_for(spec.runnable.ainvoke(arguments), timeout=spec.timeout_s)
    except Exception as e:
        spec.breaker.record(ok=False)
        audit.record("tool_call", **audit_fields, outcome="error", error=type(e).__name__,
                     ms=int((time.perf_counter() - started) * 1000))
        raise
    spec.breaker.record(ok=True)
    audit.record("tool_call", **audit_fields, outcome="ok", ms=int((time.perf_counter() - started) * 1000))
    return result


def cap_output(text: str, limit: Optional[int] = None) -> str:
    limit = limit or MAX_TOOL_OUTPUT_CHARS
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n[… {len(text) - limit} more characters truncated]"


def tools_for(agent: str, render: Optional[Callable[[str, Any], str]] = None) -> list[StructuredTool]:
    """LLM-facing tools for a ReAct agent: only the tools `agent` may call.

    The model never sees other tools. Each call goes through `call_tool`, so the
    allowlist, timeout and circuit breaker apply exactly as for code-driven calls.
    `render(name, result)` turns a result into the text the model reads (and is
    responsible for fencing it as untrusted); without it the result is capped and
    wrapped in <tool_output> tags. The raw result is kept as the ToolMessage
    artifact for the caller (e.g. to cite sources).
    Errors come back to the model as text, so it can retry or give up gracefully.
    """
    tools = []
    for spec in _REGISTRY.values():
        if agent not in spec.agents:
            continue

        async def run(_name=spec.name, **arguments):
            try:
                result = await call_tool(_name, agent=agent, **arguments)
            except Exception as e:
                return f"Tool error ({type(e).__name__}) — try different input or answer with what you have.", None
            if render:
                text = render(_name, result)
            else:
                text = wrap_untrusted("tool_output", cap_output(str(result)))
            return cap_output(text, MAX_TOOL_OUTPUT_CHARS + 200), result

        tools.append(StructuredTool.from_function(
            coroutine=run,
            name=spec.name.replace(".", "_"),        # provider tool names: [A-Za-z0-9_-]
            description=spec.description,
            args_schema=spec.runnable.args_schema,
            response_format="content_and_artifact",
        ))
    return tools


def inventory() -> list[dict]:
    return [
        {
            "name": s.name,
            "description": s.description,
            "risk": s.risk,
            "agents": sorted(s.agents),
            "timeout_s": s.timeout_s,
            "circuit": "open" if s.breaker.is_open else "closed",
        }
        for s in sorted(_REGISTRY.values(), key=lambda s: s.name)
    ]
