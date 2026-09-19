"""
Observability — Langfuse tracing (opt-in via env).

If LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are not set, every call here is a
no-op so nothing in the pipeline ever depends on Langfuse being configured.
"""
import os
from typing import Any, Optional

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
            _langfuse = Langfuse(
                public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
                secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
                host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
            )
        except Exception as e:
            print(f"[OBSERVABILITY] Langfuse init failed: {e}")
            _langfuse = None
    return _langfuse


def trace_guardrail(
    name: str,
    input_data: Any,
    output_data: Any,
    scores: Optional[dict] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Log a guardrail/eval observation to Langfuse. Always safe to call — no-ops if unconfigured."""
    lf = get_langfuse()
    if lf is None:
        return
    try:
        with lf.start_as_current_observation(
            name=name, as_type="guardrail", input=input_data, output=output_data, metadata=metadata
        ):
            for score_name, score_value in (scores or {}).items():
                lf.score_current_trace(name=score_name, value=score_value)
        lf.flush()
    except Exception as e:
        print(f"[OBSERVABILITY] Langfuse trace failed: {e}")
