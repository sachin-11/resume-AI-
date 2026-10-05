"""
Observability — Langfuse tracing, per-run token usage, request IDs.

Langfuse is opt-in (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY). Without it, runs
still get usage totals and request-id-tagged logs; nothing here ever raises into
an agent.

Privacy: prompts carry candidate PII (resumes, interview answers) and Langfuse is
a third-party SaaS. The client is built with a `mask` that replaces every string
in span input/output/metadata with a length placeholder, so traces keep the node
tree, timings, models and token counts, but no content. Set
LANGFUSE_CAPTURE_CONTENT=true only for synthetic / dev data.
"""
import logging
import os
import uuid
from collections import defaultdict
from contextvars import ContextVar
from typing import Any, Optional

from langchain_core.callbacks import BaseCallbackHandler

logger = logging.getLogger("agent.observability")

# Set per request by the FastAPI middleware; read by logs and run configs.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


# ── Redaction ────────────────────────────────────────────────────

def redact(value: Any) -> Any:
    """Replace string content with a length placeholder, recursively (fail-closed for unknown types)."""
    if isinstance(value, str):
        return f"[redacted — {len(value)} chars]"
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return f"[redacted {type(value).__name__}]"


def _mask(*, data: Any, **_: Any) -> Any:
    return redact(data)


# ── Langfuse client ──────────────────────────────────────────────

_langfuse = None
_langfuse_checked = False


def get_langfuse():
    global _langfuse, _langfuse_checked
    if _langfuse_checked:
        return _langfuse
    _langfuse_checked = True

    if os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"):
        try:
            from langfuse import Langfuse
            capture_content = os.getenv("LANGFUSE_CAPTURE_CONTENT", "").lower() == "true"
            _langfuse = Langfuse(
                public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
                secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
                host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
                environment=os.getenv("APP_ENV", "development"),
                release=os.getenv("RAILWAY_GIT_COMMIT_SHA") or os.getenv("RELEASE"),
                sample_rate=float(os.getenv("LANGFUSE_SAMPLE_RATE", "1.0")),
                mask=None if capture_content else _mask,
            )
        except Exception as e:
            logger.error("Langfuse init failed: %s", e)
            _langfuse = None
    return _langfuse


def _langfuse_handler():
    if get_langfuse() is None:
        return None
    try:
        from langfuse.langchain import CallbackHandler
        return CallbackHandler(public_key=os.getenv("LANGFUSE_PUBLIC_KEY"))
    except Exception as e:
        logger.error("Langfuse callback handler init failed: %s", e)
        return None


def flush() -> None:
    lf = get_langfuse()
    if lf is not None:
        try:
            lf.flush()
        except Exception as e:
            logger.error("Langfuse flush failed: %s", e)


# ── Token usage per run ──────────────────────────────────────────

class UsageCollector(BaseCallbackHandler):
    """Sums token usage of every LLM call in one agent run, per model.

    Attached via the run config, so it also sees calls made inside sub-graphs
    and by nodes that still use `get_llm()` directly.
    """

    def __init__(self) -> None:
        self._by_model: dict[str, dict[str, int]] = defaultdict(
            lambda: {"calls": 0, "input_tokens": 0, "output_tokens": 0}
        )

    def on_llm_end(self, response, **kwargs: Any) -> None:
        for generations in response.generations:
            for gen in generations:
                message = getattr(gen, "message", None)
                usage = getattr(message, "usage_metadata", None) or {}
                model = (getattr(message, "response_metadata", None) or {}).get("model_name", "unknown")
                bucket = self._by_model[model]
                bucket["calls"] += 1
                bucket["input_tokens"] += usage.get("input_tokens", 0) or 0
                bucket["output_tokens"] += usage.get("output_tokens", 0) or 0

    def summary(self) -> dict:
        by_model = {m: dict(v) for m, v in self._by_model.items()}
        return {
            "calls": sum(v["calls"] for v in by_model.values()),
            "input_tokens": sum(v["input_tokens"] for v in by_model.values()),
            "output_tokens": sum(v["output_tokens"] for v in by_model.values()),
            "by_model": by_model,
        }


# ── Running an agent with tracing ────────────────────────────────

def run_config(agent: str, usage: UsageCollector, user_id: Optional[str] = None) -> dict:
    """LangGraph config: Langfuse trace named after the agent, tagged with the request id."""
    request_id = request_id_var.get()
    callbacks: list = [usage]
    handler = _langfuse_handler()
    if handler is not None:
        callbacks.append(handler)

    metadata = {
        "langfuse_trace_name": agent,
        "langfuse_tags": [f"agent:{agent}", f"request:{request_id}"],
        "request_id": request_id,
    }
    if user_id:
        metadata["langfuse_user_id"] = user_id
    return {"callbacks": callbacks, "metadata": metadata, "run_name": agent}


async def run_agent(agent: str, graph, state: dict, user_id: Optional[str] = None) -> tuple[dict, dict]:
    """Invoke a compiled graph with tracing; returns (final_state, usage_summary)."""
    usage = UsageCollector()
    final_state = await graph.ainvoke(state, config=run_config(agent, usage, user_id))
    summary = usage.summary()
    logger.info(
        "agent_run agent=%s calls=%s input_tokens=%s output_tokens=%s",
        agent, summary["calls"], summary["input_tokens"], summary["output_tokens"],
    )
    return final_state, summary


# ── Guardrail events ─────────────────────────────────────────────

def trace_guardrail(
    name: str,
    input_data: Any,
    output_data: Any,
    scores: Optional[dict] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Log a guardrail/eval observation (+ scores) to Langfuse. No-op if unconfigured.

    Content is masked by the client's `mask` like every other span.
    """
    lf = get_langfuse()
    if lf is None:
        return
    try:
        with lf.start_as_current_observation(
            name=name, as_type="guardrail",
            input=input_data, output=output_data, metadata=metadata,
        ):
            for score_name, score_value in (scores or {}).items():
                lf.score_current_trace(name=score_name, value=score_value)
    except Exception as e:
        logger.error("Langfuse guardrail trace failed: %s", e)


# ── Logging ──────────────────────────────────────────────────────

class RequestIdLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def new_request_id(incoming: Optional[str]) -> str:
    """Accept a caller-supplied id if it looks sane, else mint one."""
    if incoming and len(incoming) <= 64 and incoming.replace("-", "").isalnum():
        return incoming
    return uuid.uuid4().hex
