"""
Audit trail — who made which agent do what, and how it went.

Recorded: every tool call, every human approval answer, every kill-switch change.
Each event is one JSON log line on the `agent.audit` logger (ship it to the log
platform for retention) and is kept in a small in-process ring for
GET /admin/audit.

Tool arguments can carry candidate data, so they are never logged raw: an event
keeps the argument names and a SHA-256 of the values — enough to tell whether two
calls had the same input, not to read it.
"""
import hashlib
import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("agent.audit")

_recent: deque = deque(maxlen=500)


def fingerprint(arguments: dict) -> str:
    body = json.dumps(arguments, sort_keys=True, default=str)
    return hashlib.sha256(body.encode()).hexdigest()[:16]


def record(event: str, **fields: Any) -> dict:
    from core.auth import caller_var                  # lazy: avoid import cycles
    from core.observability import request_id_var

    caller = caller_var.get()
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "request_id": request_id_var.get(),
        "user_id": caller.user_id if caller else None,
        "org_id": caller.org_id if caller else None,
        **fields,
    }
    _recent.append(entry)
    logger.info(json.dumps(entry, default=str))
    return entry


def recent(limit: int = 100, event: Optional[str] = None) -> list[dict]:
    rows = [e for e in reversed(_recent) if event is None or e["event"] == event]
    return rows[:limit]
