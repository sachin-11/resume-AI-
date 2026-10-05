"""
Conversation memory — the LangGraph checkpointer behind multi-turn agents.

Backend:
  - Postgres (AsyncPostgresSaver), in its own `agent_memory` schema so Prisma's
    `migrate dev` never sees these tables as drift in `public`.
  - In-memory (MemorySaver) when DATABASE_URL is unset, AGENT_MEMORY=memory, or
    the event loop can't host psycopg's async driver. That last case is Windows'
    ProactorEventLoop, which local dev needs for the MCP subprocess client.
    In-memory threads are lost on restart and not shared across replicas.

Threads are namespaced by user (`thread_key`), so a thread id alone can never
reach another user's conversation.
"""
import asyncio
import logging
import os
import re
import sys
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger("agent.memory")

SCHEMA = "agent_memory"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Prisma-only query params that libpq rejects.
_PRISMA_PARAMS = {"schema", "connection_limit", "pool_timeout", "pgbouncer", "socket_timeout", "statement_cache_size"}

_checkpointer: Optional[BaseCheckpointSaver] = None
_pool = None
backend = "none"


def is_safe_id(value: Optional[str]) -> bool:
    return bool(value) and bool(_SAFE_ID.match(value))


def thread_key(user_id: str, thread_id: str) -> str:
    """Checkpointer thread id. Both parts are validated, so ':' can't be smuggled in."""
    if not (is_safe_id(user_id) and is_safe_id(thread_id)):
        raise ValueError("Invalid user_id or thread_id")
    return f"{user_id}:{thread_id}"


def _libpq_url(url: str) -> str:
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in _PRISMA_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(query)))


async def _open_postgres(url: str):
    from psycopg import AsyncConnection
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    async with await AsyncConnection.connect(url, autocommit=True) as conn:
        await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    pool = AsyncConnectionPool(
        url,
        min_size=1,
        max_size=int(os.getenv("AGENT_MEMORY_POOL_MAX", "5")),
        open=False,
        kwargs={
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
            "options": f"-c search_path={SCHEMA}",
        },
    )
    await pool.open(wait=True, timeout=10)
    saver = AsyncPostgresSaver(pool)
    await saver.setup()
    return saver, pool


async def open_checkpointer() -> BaseCheckpointSaver:
    global _checkpointer, _pool, backend
    url = os.getenv("DATABASE_URL")
    wants_postgres = os.getenv("AGENT_MEMORY", "postgres").lower() == "postgres" and url

    if wants_postgres:
        loop = asyncio.get_running_loop()
        if sys.platform == "win32" and isinstance(loop, asyncio.ProactorEventLoop):
            logger.warning(
                "Postgres checkpointer can't run on Windows' ProactorEventLoop — using in-memory "
                "conversation memory (local dev only; threads are lost on restart)."
            )
        else:
            try:
                _checkpointer, _pool = await _open_postgres(_libpq_url(url))
                backend = "postgres"
                logger.info("Conversation memory: postgres (schema %s)", SCHEMA)
                return _checkpointer
            except Exception as e:
                logger.error(
                    "Postgres checkpointer unavailable (%s) — falling back to in-memory; "
                    "conversations will not survive restarts.", e,
                )

    _checkpointer = MemorySaver()
    backend = "memory"
    return _checkpointer


def get_pool():
    """The Postgres connection pool (search_path = agent_memory), or None when in-memory."""
    return _pool


async def close_checkpointer() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
