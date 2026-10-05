"""
Per-user rate limit for agent runs (token bucket, per process).

Every agent run costs several LLM calls, so one user (or a stuck client retry
loop) shouldn't be able to burn the shared provider quota for everyone. Keyed on
the user from the verified token; legacy shared-secret calls carry no user and
are left to the Next.js side's own per-IP limits.
"""
import os
import time
from collections import OrderedDict
from typing import Optional

from fastapi import Depends, HTTPException

from core.auth import Caller, get_caller

_MAX_KEYS = 10_000


class TokenBucket:
    def __init__(self, per_minute: float, burst: float) -> None:
        self.rate = per_minute / 60.0
        self.burst = burst
        self._buckets: OrderedDict[str, tuple[float, float]] = OrderedDict()

    def take(self, key: str) -> Optional[float]:
        """Consume one token. Returns None if allowed, else seconds until a token is available."""
        now = time.monotonic()
        tokens, last = self._buckets.pop(key, (self.burst, now))
        tokens = min(self.burst, tokens + (now - last) * self.rate)
        if tokens >= 1:
            self._buckets[key] = (tokens - 1, now)
            allowed = None
        else:
            self._buckets[key] = (tokens, now)
            allowed = (1 - tokens) / self.rate
        while len(self._buckets) > _MAX_KEYS:
            self._buckets.popitem(last=False)  # forget the least recently seen users
        return allowed


_bucket: Optional[TokenBucket] = None


def _get_bucket() -> TokenBucket:
    global _bucket
    if _bucket is None:
        _bucket = TokenBucket(
            per_minute=float(os.getenv("AGENT_USER_RPM", "30")),
            burst=float(os.getenv("AGENT_USER_BURST", "10")),
        )
    return _bucket


async def limited_caller(caller: Caller = Depends(get_caller)) -> Caller:
    """Auth + per-user rate limit — the dependency for endpoints that start agent runs."""
    if caller.user_id:
        wait = _get_bucket().take(caller.user_id)
        if wait is not None:
            raise HTTPException(
                status_code=429,
                detail="Too many agent requests — please slow down.",
                headers={"Retry-After": str(max(1, round(wait)))},
            )
    return caller
