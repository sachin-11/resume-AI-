"""Reusable field types for LLM output schemas."""
from typing import Annotated, Any

from pydantic import BeforeValidator, Field


def _none_to_empty_list(value: Any) -> Any:
    return [] if value is None else value


# 0-100 integer score. Out-of-range values fail validation (and trigger a re-ask)
# instead of silently flowing into a hiring decision.
Score = Annotated[int, Field(ge=0, le=100)]

# 0.0-1.0 float score (eval metrics).
UnitScore = Annotated[float, Field(ge=0.0, le=1.0)]

# Models often send `null` for "nothing found" — treat that as an empty list.
StrList = Annotated[list[str], BeforeValidator(_none_to_empty_list)]
