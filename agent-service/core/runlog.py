"""
Run history — one row per agent run, kept for RUN_HISTORY_DAYS (default 90).

core/metrics.py answers "how is it doing right now" for one process and resets
on every restart (and a free Render instance restarts whenever it sleeps). This
module answers "how has it been doing": every run_agent call appends a row to
agent_memory.agent_runs, and GET /admin/runs turns a time window into the
numbers behind the admin "Agent health" dashboard.

A row holds numbers and ids only — agent, status, latency, tokens, cost,
version, variant, user/org/request id — never prompts, resumes or answers.
Writing is fire-and-forget: a failed insert is logged, never raised into a run.
Postgres when the pool exists, an in-memory ring otherwise (local dev / tests).
"""
import asyncio
import logging
import os
import statistics
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("agent.runlog")

RETENTION_DAYS = int(os.getenv("RUN_HISTORY_DAYS", "90"))
# Daily buckets are cut in the team's timezone (IST by default), not UTC.
TZ = timezone(timedelta(minutes=int(os.getenv("RUN_HISTORY_TZ_OFFSET_MIN", "330"))))
MAX_ROWS = 50_000

_memory: deque = deque(maxlen=5_000)
_pending: set = set()          # keeps fire-and-forget insert tasks alive until done
_table_ready = False
# Concurrent first writes would race on CREATE TABLE (Postgres rejects the loser).
_table_lock = asyncio.Lock()
_last_prune: Optional[datetime] = None


def _pool():
    from core.memory import get_pool
    return get_pool()


async def _ensure_table(pool) -> None:
    global _table_ready
    if _table_ready:
        return
    async with _table_lock:
        if _table_ready:
            return
        async with pool.connection() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_runs (
                    id             BIGSERIAL PRIMARY KEY,
                    at             TIMESTAMPTZ NOT NULL DEFAULT now(),
                    agent          TEXT NOT NULL,
                    status         TEXT NOT NULL,
                    ms             INTEGER NOT NULL,
                    calls          INTEGER NOT NULL DEFAULT 0,
                    input_tokens   INTEGER NOT NULL DEFAULT 0,
                    output_tokens  INTEGER NOT NULL DEFAULT 0,
                    cost_usd       DOUBLE PRECISION NOT NULL DEFAULT 0,
                    version        TEXT,
                    variant        TEXT,
                    user_id        TEXT,
                    org_id         TEXT,
                    request_id     TEXT
                )""")
            await conn.execute("CREATE INDEX IF NOT EXISTS agent_runs_at ON agent_runs (at)")
        _table_ready = True


async def _insert(row: dict) -> None:
    global _last_prune
    pool = _pool()
    if pool is None:
        _memory.append(row)
        return
    try:
        await _ensure_table(pool)
        async with pool.connection() as conn:
            await conn.execute(
                """INSERT INTO agent_runs (at, agent, status, ms, calls, input_tokens, output_tokens, cost_usd,
                       version, variant, user_id, org_id, request_id)
                   VALUES (%(at)s, %(agent)s, %(status)s, %(ms)s, %(calls)s, %(input_tokens)s, %(output_tokens)s,
                       %(cost_usd)s, %(version)s, %(variant)s, %(user_id)s, %(org_id)s, %(request_id)s)""",
                row,
            )
            if _last_prune is None or row["at"] - _last_prune > timedelta(days=1):
                _last_prune = row["at"]
                await conn.execute("DELETE FROM agent_runs WHERE at < now() - make_interval(days => %s)",
                                   (RETENTION_DAYS,))
    except Exception as e:
        logger.error("Saving run history failed: %s", e)


def record(*, agent: str, status: str, ms: float, usage: dict, version: str, variant: str) -> None:
    """Append one run. Never blocks or raises into the caller."""
    from core.auth import caller_var
    from core.observability import request_id_var

    caller = caller_var.get()
    row = {
        "at": datetime.now(timezone.utc), "agent": agent, "status": status, "ms": int(ms),
        "calls": usage.get("calls", 0), "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0), "cost_usd": usage.get("cost_usd", 0.0),
        "version": version, "variant": variant,
        "user_id": caller.user_id if caller else None, "org_id": caller.org_id if caller else None,
        "request_id": request_id_var.get(),
    }
    try:
        task = asyncio.get_running_loop().create_task(_insert(row))
    except RuntimeError:          # no event loop (sync caller) — keep it in memory
        _memory.append(row)
        return
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def _rows_since(since: datetime) -> list[dict]:
    pool = _pool()
    if pool is None:
        return [r for r in _memory if r["at"] >= since]
    await _ensure_table(pool)
    async with pool.connection() as conn:
        cur = await conn.execute(
            """SELECT at, agent, status, ms, cost_usd, input_tokens, output_tokens, version, request_id
               FROM agent_runs WHERE at >= %s ORDER BY at LIMIT %s""",
            (since, MAX_ROWS),
        )
        return list(await cur.fetchall())


def _pct(values: list, q: float) -> Optional[int]:
    if not values:
        return None
    ordered = sorted(values)
    return int(ordered[min(len(ordered) - 1, int(len(ordered) * q))])


def _stats(rows: list[dict]) -> dict:
    failed = sum(r["status"] != "ok" for r in rows)
    ms = [r["ms"] for r in rows]
    return {
        "runs": len(rows),
        "failed": failed,
        "error_rate": round(failed / len(rows), 4) if rows else 0.0,
        "p50_ms": int(statistics.median(ms)) if ms else None,
        "p95_ms": _pct(ms, 0.95),
        "cost_usd": round(sum(r["cost_usd"] for r in rows), 6),
        "tokens": sum(r["input_tokens"] + r["output_tokens"] for r in rows),
    }


async def summary(days: int) -> dict:
    """Everything the dashboard shows for the last `days` days."""
    now = datetime.now(TZ)
    first_day = (now - timedelta(days=days - 1)).date()
    since = datetime.combine(first_day, datetime.min.time(), tzinfo=TZ)
    rows = await _rows_since(since)

    by_day, by_agent, statuses = defaultdict(list), defaultdict(list), defaultdict(int)
    for r in rows:
        by_day[r["at"].astimezone(TZ).date()].append(r)
        by_agent[r["agent"]].append(r)
        statuses[r["status"]] += 1

    daily = []
    for i in range(days):                      # every day in the window, empty days included
        day = first_day + timedelta(days=i)
        s = _stats(by_day.get(day, []))
        daily.append({"date": day.isoformat(), "ok": s["runs"] - s["failed"], "failed": s["failed"],
                      "cost_usd": s["cost_usd"], "p95_ms": s["p95_ms"]})

    agents = []
    for name, agent_rows in sorted(by_agent.items(), key=lambda kv: -len(kv[1])):
        latest = agent_rows[-1]
        agents.append({"agent": name, **_stats(agent_rows), "version": latest["version"],
                       "last_run": latest["at"].isoformat()})

    failures = [{"at": r["at"].isoformat(), "agent": r["agent"], "status": r["status"], "ms": r["ms"],
                 "version": r["version"], "request_id": r["request_id"]}
                for r in reversed(rows) if r["status"] != "ok"][:25]

    return {
        "days": days,
        "timezone_offset_min": int(TZ.utcoffset(None).total_seconds() // 60),
        "truncated": len(rows) >= MAX_ROWS,
        "totals": _stats(rows),
        "statuses": dict(statuses),
        "daily": daily,
        "agents": agents,
        "recent_failures": failures,
    }


def reset_for_tests() -> None:
    _memory.clear()
