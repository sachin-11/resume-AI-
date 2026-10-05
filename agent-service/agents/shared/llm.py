"""Shared LLM utility for all agents — thin compatibility layer over core.llm.

New code should use `core.llm.ainvoke_structured` with a Pydantic schema instead
of `get_llm()` + `safe_json_parse()`.
"""
from typing import Any

from core.llm import extract_json, get_llm  # noqa: F401  (re-exported)


def safe_json_parse(text: str, fallback: Any) -> Any:
    try:
        return extract_json(text)
    except Exception:
        return fallback
