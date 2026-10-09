"""
User feedback on agent answers — the start of the eval feedback loop.

    thumbs-down in the UI → POST /feedback → agent_memory.agent_feedback
      → python -m evals.harvest_feedback  (writes evals/review_queue.jsonl)
      → a person labels the expected outcome and moves it to evals/regressions.jsonl
      → run_evals picks it up as a gated case, so the same mistake can't ship twice.

The stored input/output are what the user saw; contact details are masked before
storage (same rule as for prompts), and both are size-capped. Postgres when the
pool exists, in-memory otherwise.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from core.guardrails import redact_contact_info

logger = logging.getLogger("agent.feedback")

Rating = Literal["up", "down"]
_memory: list[dict] = []
_table_ready = False


def _pool():
    from core.memory import get_pool
    return get_pool()


async def _ensure_table(pool) -> None:
    global _table_ready
    if _table_ready:
        return
    async with pool.connection() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_feedback (
                id          TEXT PRIMARY KEY,
                agent       TEXT NOT NULL,
                rating      TEXT NOT NULL,
                comment     TEXT NOT NULL DEFAULT '',
                input       TEXT NOT NULL DEFAULT '',
                output      TEXT NOT NULL DEFAULT '',
                version     TEXT,
                request_id  TEXT,
                thread_id   TEXT,
                user_id     TEXT,
                org_id      TEXT,
                exported    BOOLEAN NOT NULL DEFAULT false,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )""")
        await conn.execute("CREATE INDEX IF NOT EXISTS agent_feedback_queue ON agent_feedback (rating, exported)")
    _table_ready = True


async def save(*, agent: str, rating: Rating, comment: str, input: str, output: str, version: Optional[str],
               request_id: Optional[str], thread_id: Optional[str], user_id: Optional[str],
               org_id: Optional[str]) -> dict:
    row = {
        "id": uuid.uuid4().hex, "agent": agent, "rating": rating, "comment": redact_contact_info(comment),
        "input": redact_contact_info(input), "output": redact_contact_info(output), "version": version,
        "request_id": request_id, "thread_id": thread_id, "user_id": user_id, "org_id": org_id,
        "exported": False, "created_at": datetime.now(timezone.utc),
    }
    pool = _pool()
    if pool is None:
        _memory.append(row)
    else:
        await _ensure_table(pool)
        async with pool.connection() as conn:
            await conn.execute(
                """INSERT INTO agent_feedback (id, agent, rating, comment, input, output, version,
                       request_id, thread_id, user_id, org_id, created_at)
                   VALUES (%(id)s, %(agent)s, %(rating)s, %(comment)s, %(input)s, %(output)s, %(version)s,
                       %(request_id)s, %(thread_id)s, %(user_id)s, %(org_id)s, %(created_at)s)""",
                row,
            )
    logger.info("agent_feedback agent=%s rating=%s version=%s", agent, rating, version)
    return row


def memory_rows() -> list[dict]:
    return _memory
