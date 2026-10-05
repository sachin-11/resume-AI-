"""
Durable background jobs for long agent runs.

Why: a screening or panel run takes 20-90s. Holding an HTTP request open that
long through a serverless Next.js function risks the platform timeout cutting it
off and the result being lost. Instead the caller submits a job (202 + job_id
immediately), a worker runs it, and the caller polls for status — with live
node-by-node progress while it runs.

Storage: a table in the same `agent_memory` Postgres schema as the checkpointer
(no new infrastructure). Workers claim jobs with `FOR UPDATE SKIP LOCKED`, so
several workers / replicas never run the same job. A claimed job holds a lease
that the worker keeps extending; if the worker dies, the lease expires and
another worker picks the job up (at most MAX_ATTEMPTS times). Without Postgres
(local Windows dev, tests) an in-memory store with the same interface is used.
"""
import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from fastapi import HTTPException
from langchain_core.callbacks import BaseCallbackHandler
from pydantic import BaseModel, ValidationError

from core.auth import Caller, caller_var
from core.observability import progress_var, request_id_var

logger = logging.getLogger("agent.jobs")

MAX_ATTEMPTS = 3
LEASE_S = 60
JOB_TIMEOUT_S = int(os.getenv("AGENT_JOB_TIMEOUT_S", "600"))
POLL_IDLE_S = 1.0

PUBLIC_FIELDS = ("id", "agent", "status", "progress", "result", "error", "error_code",
                 "created_at", "started_at", "finished_at")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Job types ────────────────────────────────────────────────────

@dataclass
class JobType:
    name: str
    input_model: type[BaseModel]
    handler: Callable[..., Awaitable[dict]]   # handler(request=<input_model>, caller=Caller) -> dict


_TYPES: dict[str, JobType] = {}


def register(name: str, input_model: type[BaseModel], handler: Callable[..., Awaitable[dict]]) -> None:
    _TYPES[name] = JobType(name, input_model, handler)


def validate_input(agent: str, payload: dict) -> BaseModel:
    job_type = _TYPES.get(agent)
    if job_type is None:
        raise HTTPException(status_code=400, detail=f"Unknown job agent '{agent}'. Allowed: {sorted(_TYPES)}")
    try:
        return job_type.input_model.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.errors(include_url=False, include_input=False))


# ── Progress (node-by-node) ──────────────────────────────────────

class ProgressCollector(BaseCallbackHandler):
    """Records each LangGraph node as it starts (sub-agent nodes included)."""

    def __init__(self) -> None:
        self.events: list[dict] = []

    def on_chain_start(self, serialized, inputs, *, metadata=None, **kwargs) -> None:
        node = (metadata or {}).get("langgraph_node")
        # A node's own run has name == node; edges/routers inside it have other names.
        if node and kwargs.get("name") == node and not node.startswith("__"):
            if not self.events or self.events[-1]["node"] != node:
                self.events.append({"node": node, "at": _now().isoformat()})


# ── Stores ───────────────────────────────────────────────────────

class MemoryJobStore:
    """Single-process store for local dev / tests. Lost on restart."""

    def __init__(self) -> None:
        self._jobs: dict[str, dict] = {}
        self._lock = asyncio.Lock()

    async def setup(self) -> None:
        pass

    async def create(self, *, agent, payload, caller: Caller, request_id, idempotency_key) -> tuple[dict, bool]:
        async with self._lock:
            if idempotency_key:
                for job in self._jobs.values():
                    if job["user_id"] == caller.user_id and job["idempotency_key"] == idempotency_key:
                        return job, False
            job = {
                "id": uuid.uuid4().hex, "agent": agent, "status": "queued", "input": payload,
                "user_id": caller.user_id, "org_id": caller.org_id, "role": caller.role, "via": caller.via,
                "request_id": request_id, "idempotency_key": idempotency_key,
                "progress": [], "result": None, "error": None, "error_code": None, "attempts": 0,
                "usage_acked": False, "created_at": _now(), "started_at": None, "finished_at": None,
                "locked_until": None,
            }
            self._jobs[job["id"]] = job
            return job, True

    async def get(self, job_id: str) -> Optional[dict]:
        return self._jobs.get(job_id)

    async def claim(self) -> Optional[dict]:
        async with self._lock:
            now = _now()
            for job in sorted(self._jobs.values(), key=lambda j: j["created_at"]):
                stale = job["status"] == "running" and job["locked_until"] and job["locked_until"] < now
                if job["status"] == "queued" or stale:
                    job.update(status="running", attempts=job["attempts"] + 1,
                               started_at=job["started_at"] or now,
                               locked_until=datetime.fromtimestamp(time.time() + LEASE_S, timezone.utc))
                    return dict(job)
            return None

    async def heartbeat(self, job_id: str, progress: list) -> None:
        job = self._jobs[job_id]
        job.update(progress=list(progress), locked_until=datetime.fromtimestamp(time.time() + LEASE_S, timezone.utc))

    async def finish(self, job_id: str, *, status, progress, result=None, error=None, error_code=None) -> None:
        self._jobs[job_id].update(status=status, progress=list(progress), result=result, error=error,
                                  error_code=error_code, finished_at=_now(), locked_until=None)

    async def ack_usage(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if not job or job["usage_acked"] or job["status"] != "succeeded":
            return False
        job["usage_acked"] = True
        return True


class PostgresJobStore:
    def __init__(self, pool) -> None:
        self.pool = pool

    async def setup(self) -> None:
        async with self.pool.connection() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_jobs (
                    id              text PRIMARY KEY,
                    agent           text NOT NULL,
                    status          text NOT NULL,             -- queued | running | succeeded | failed
                    input           jsonb NOT NULL,
                    user_id         text,
                    org_id          text,
                    role            text,
                    via             text NOT NULL,
                    request_id      text,
                    idempotency_key text,
                    progress        jsonb NOT NULL DEFAULT '[]',
                    result          jsonb,
                    error           text,
                    error_code      int,
                    attempts        int NOT NULL DEFAULT 0,
                    usage_acked     boolean NOT NULL DEFAULT false,
                    created_at      timestamptz NOT NULL DEFAULT now(),
                    started_at      timestamptz,
                    finished_at     timestamptz,
                    locked_until    timestamptz
                )""")
            await conn.execute("CREATE INDEX IF NOT EXISTS agent_jobs_claim ON agent_jobs (status, created_at)")
            await conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS agent_jobs_idem
                                  ON agent_jobs (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL""")

    async def create(self, *, agent, payload, caller: Caller, request_id, idempotency_key) -> tuple[dict, bool]:
        from psycopg.types.json import Jsonb
        async with self.pool.connection() as conn:
            row = await (await conn.execute(
                """INSERT INTO agent_jobs (id, agent, status, input, user_id, org_id, role, via, request_id, idempotency_key)
                   VALUES (%s, %s, 'queued', %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT DO NOTHING RETURNING *""",
                (uuid.uuid4().hex, agent, Jsonb(payload), caller.user_id, caller.org_id, caller.role,
                 caller.via, request_id, idempotency_key),
            )).fetchone()
            if row:
                return row, True
            existing = await (await conn.execute(
                "SELECT * FROM agent_jobs WHERE user_id IS NOT DISTINCT FROM %s AND idempotency_key = %s",
                (caller.user_id, idempotency_key),
            )).fetchone()
            return existing, False

    async def get(self, job_id: str) -> Optional[dict]:
        async with self.pool.connection() as conn:
            return await (await conn.execute("SELECT * FROM agent_jobs WHERE id = %s", (job_id,))).fetchone()

    async def claim(self) -> Optional[dict]:
        async with self.pool.connection() as conn:
            return await (await conn.execute(
                """UPDATE agent_jobs
                   SET status = 'running', attempts = attempts + 1,
                       started_at = coalesce(started_at, now()),
                       locked_until = now() + make_interval(secs => %s)
                   WHERE id = (
                       SELECT id FROM agent_jobs
                       WHERE status = 'queued' OR (status = 'running' AND locked_until < now())
                       ORDER BY created_at
                       FOR UPDATE SKIP LOCKED
                       LIMIT 1)
                   RETURNING *""",
                (LEASE_S,),
            )).fetchone()

    async def heartbeat(self, job_id: str, progress: list) -> None:
        from psycopg.types.json import Jsonb
        async with self.pool.connection() as conn:
            await conn.execute(
                "UPDATE agent_jobs SET progress = %s, locked_until = now() + make_interval(secs => %s) WHERE id = %s",
                (Jsonb(progress), LEASE_S, job_id),
            )

    async def finish(self, job_id: str, *, status, progress, result=None, error=None, error_code=None) -> None:
        from psycopg.types.json import Jsonb
        async with self.pool.connection() as conn:
            await conn.execute(
                """UPDATE agent_jobs SET status = %s, progress = %s, result = %s, error = %s, error_code = %s,
                          finished_at = now(), locked_until = NULL
                   WHERE id = %s""",
                (status, Jsonb(progress), Jsonb(result) if result is not None else None, error, error_code, job_id),
            )

    async def ack_usage(self, job_id: str) -> bool:
        async with self.pool.connection() as conn:
            row = await (await conn.execute(
                """UPDATE agent_jobs SET usage_acked = true
                   WHERE id = %s AND status = 'succeeded' AND NOT usage_acked RETURNING id""",
                (job_id,),
            )).fetchone()
            return row is not None


# ── Runner ───────────────────────────────────────────────────────

def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


class JobRunner:
    def __init__(self, store, workers: int) -> None:
        self.store = store
        self.workers = workers
        self._tasks: list[asyncio.Task] = []
        self._stopping = False

    async def start(self) -> None:
        await self.store.setup()
        self._tasks = [asyncio.create_task(self._loop(i)) for i in range(self.workers)]
        logger.info("job workers started: %d (%s)", self.workers, type(self.store).__name__)

    async def stop(self) -> None:
        self._stopping = True
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _loop(self, worker: int) -> None:
        while not self._stopping:
            try:
                job = await self.store.claim()
            except Exception as e:  # DB hiccup: back off, keep the worker alive
                logger.error("job claim failed: %s", e)
                await asyncio.sleep(5)
                continue
            if job is None:
                await asyncio.sleep(POLL_IDLE_S)
                continue
            await self.run(job)

    async def run(self, job: dict) -> None:
        if job["attempts"] > MAX_ATTEMPTS:
            await self.store.finish(job["id"], status="failed", progress=job.get("progress") or [],
                                    error="Job was interrupted too many times", error_code=500)
            return

        caller = Caller(via=job["via"], user_id=job["user_id"], org_id=job["org_id"], role=job["role"])
        collector = ProgressCollector()
        tokens = (caller_var.set(caller), request_id_var.set(job.get("request_id") or job["id"]),
                  progress_var.set(collector))
        heartbeat = asyncio.create_task(self._heartbeat(job["id"], collector))
        try:
            job_type = _TYPES[job["agent"]]
            request = job_type.input_model.model_validate(job["input"])
            result = await asyncio.wait_for(job_type.handler(request=request, caller=caller), JOB_TIMEOUT_S)
            await self.store.finish(job["id"], status="succeeded", progress=collector.events, result=_json_safe(result))
            logger.info("job_done id=%s agent=%s", job["id"], job["agent"])
        except HTTPException as e:
            await self.store.finish(job["id"], status="failed", progress=collector.events,
                                    error=str(e.detail), error_code=e.status_code)
        except asyncio.TimeoutError:
            await self.store.finish(job["id"], status="failed", progress=collector.events,
                                    error="Agent run timed out", error_code=504)
        except Exception:
            logger.exception("job_failed id=%s agent=%s", job["id"], job["agent"])
            await self.store.finish(job["id"], status="failed", progress=collector.events,
                                    error="Agent run failed", error_code=500)
        finally:
            heartbeat.cancel()
            caller_var.reset(tokens[0])
            request_id_var.reset(tokens[1])
            progress_var.reset(tokens[2])

    async def _heartbeat(self, job_id: str, collector: ProgressCollector) -> None:
        """Publish progress and keep the lease alive while the job runs."""
        sent = -1
        while True:
            await asyncio.sleep(0.5)
            if len(collector.events) != sent or int(time.time()) % 15 == 0:
                sent = len(collector.events)
                try:
                    await self.store.heartbeat(job_id, collector.events)
                except Exception as e:
                    logger.warning("job heartbeat failed id=%s: %s", job_id, e)


def public_view(job: dict) -> dict:
    view = {k: job.get(k) for k in PUBLIC_FIELDS}
    for k in ("created_at", "started_at", "finished_at"):
        if isinstance(view[k], datetime):
            view[k] = view[k].isoformat()
    return view


def owns(job: Optional[dict], caller: Caller) -> bool:
    """A job is visible only to the user who submitted it (legacy jobs only to legacy callers)."""
    return job is not None and job["user_id"] == caller.user_id
