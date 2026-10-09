"""
Kill switch — turn an agent off, or make it read-only, without a deploy.

Modes per agent (agent = the run_agent name, e.g. "bulk-screening"; "*" = all):
  on         normal.
  read_only  the agent still answers, but actions with side effects are refused
             (approving an interview booking, indexing FAQ docs).
  off        every run is refused with 503 — the caller shows "temporarily unavailable".

Sources, strongest first:
  1. AGENT_KILL_SWITCH="bulk-screening,auto-apply" (or "*")  → off. Needs a restart,
     but works even if the database is down.
  2. Runtime overrides set by an admin via PUT /admin/flags/{agent}. Stored in
     Postgres (agent_memory.agent_flags) so every replica sees them within
     CACHE_S seconds; in-memory without Postgres (local dev / tests).
  3. AGENT_READ_ONLY="orchestrate" (or "*")                  → read_only.
"""
import logging
import os
import time
from datetime import datetime, timezone
from typing import Literal, Optional

from core.guards import AgentUnavailable
from core.release import family

logger = logging.getLogger("agent.flags")

Mode = Literal["on", "read_only", "off"]
MODES = ("on", "read_only", "off")
CACHE_S = 5.0

_memory: dict[str, dict] = {}
_cache: tuple[float, dict[str, dict]] = (0.0, {})
_table_ready = False


def _env_list(name: str) -> set[str]:
    return {x.strip() for x in os.getenv(name, "").split(",") if x.strip()}


def _pool():
    from core.memory import get_pool  # lazy: memory pulls in langgraph
    return get_pool()


async def _ensure_table(pool) -> None:
    global _table_ready
    if _table_ready:
        return
    async with pool.connection() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_flags (
                agent       TEXT PRIMARY KEY,
                mode        TEXT NOT NULL,
                reason      TEXT NOT NULL DEFAULT '',
                updated_by  TEXT,
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )""")
    _table_ready = True


async def _overrides() -> dict[str, dict]:
    global _cache
    pool = _pool()
    if pool is None:
        return _memory
    fetched_at, rows = _cache
    if time.monotonic() - fetched_at < CACHE_S:
        return rows
    try:
        await _ensure_table(pool)
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT agent, mode, reason, updated_by, updated_at FROM agent_flags")
            rows = {r["agent"]: dict(r) for r in await cur.fetchall()}
    except Exception as e:
        # Fail open on the override table (env kill switch still applies): a DB blip
        # must not take every agent down. Keep serving the last known overrides.
        logger.error("Reading agent flags failed (%s) — using last known flags", e)
    _cache = (time.monotonic(), rows)
    return rows


async def mode_for(agent: str) -> Mode:
    name = family(agent)
    killed = _env_list("AGENT_KILL_SWITCH")
    if name in killed or "*" in killed:
        return "off"
    overrides = await _overrides()
    for key in (name, "*"):
        if key in overrides and overrides[key]["mode"] != "on":
            return overrides[key]["mode"]
    read_only = _env_list("AGENT_READ_ONLY")
    if name in read_only or "*" in read_only:
        return "read_only"
    return "on"


async def ensure_runnable(agent: str) -> None:
    if await mode_for(agent) == "off":
        raise AgentUnavailable(f"Agent '{family(agent)}' is switched off by an operator.")


async def ensure_writable(agent: str) -> None:
    mode = await mode_for(agent)
    if mode != "on":
        raise AgentUnavailable(f"Agent '{family(agent)}' is {mode.replace('_', '-')} — actions are disabled right now.")


async def set_mode(agent: str, mode: Mode, *, by: Optional[str], reason: str = "") -> dict:
    global _cache
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    row = {"agent": agent, "mode": mode, "reason": reason, "updated_by": by,
           "updated_at": datetime.now(timezone.utc)}
    pool = _pool()
    if pool is None:
        _memory[agent] = row
    else:
        await _ensure_table(pool)
        async with pool.connection() as conn:
            await conn.execute(
                """INSERT INTO agent_flags (agent, mode, reason, updated_by, updated_at)
                   VALUES (%(agent)s, %(mode)s, %(reason)s, %(updated_by)s, %(updated_at)s)
                   ON CONFLICT (agent) DO UPDATE SET mode = EXCLUDED.mode, reason = EXCLUDED.reason,
                       updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at""",
                row,
            )
        _cache = (0.0, {})   # this replica sees the change at once
    logger.warning("agent_flag agent=%s mode=%s by=%s reason=%s", agent, mode, by, reason)
    return row


async def snapshot() -> dict:
    return {
        "env_kill_switch": sorted(_env_list("AGENT_KILL_SWITCH")),
        "env_read_only": sorted(_env_list("AGENT_READ_ONLY")),
        "overrides": {k: {**v, "updated_at": str(v["updated_at"])} for k, v in (await _overrides()).items()},
    }


def reset_for_tests() -> None:
    global _cache
    _memory.clear()
    _cache = (0.0, {})
