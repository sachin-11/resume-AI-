"""
Run metrics and alerts — the numbers on-call looks at first.

Per agent (and per release variant, so a canary can be compared with stable):
runs, outcomes by status, error rate over the last WINDOW runs, p50/p95 latency,
tokens and $ cost. Served at GET /admin/metrics.

Alerts (logged at ERROR, and POSTed to ALERT_WEBHOOK_URL — Slack/Discord-style
{"text": ...} — when set), each at most once per ALERT_COOLDOWN_S:
  - error rate ≥ ALERT_ERROR_RATE over the last WINDOW runs (min ALERT_MIN_RUNS runs)
  - p95 latency ≥ ALERT_P95_MS
  - today's spend ≥ ALERT_DAILY_COST_USD (the cost alarm)
  - an agent's circuit breaker opened

Counters are per process: with several replicas, each alerts on its own traffic
(fine for alerting); for fleet-wide dashboards use Langfuse, which gets every trace.
"""
import asyncio
import logging
import os
import statistics
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

logger = logging.getLogger("agent.metrics")

WINDOW = 50


def _f(name: str, default: str) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return float(default)


@dataclass
class AgentStats:
    runs: int = 0
    statuses: Counter = field(default_factory=Counter)
    variants: Counter = field(default_factory=Counter)
    variant_errors: Counter = field(default_factory=Counter)
    recent_ok: deque = field(default_factory=lambda: deque(maxlen=WINDOW))
    latencies_ms: deque = field(default_factory=lambda: deque(maxlen=WINDOW * 4))
    tokens: int = 0
    cost_usd: float = 0.0
    last_version: str = ""

    def view(self) -> dict:
        lat = sorted(self.latencies_ms)
        window = list(self.recent_ok)
        return {
            "runs": self.runs,
            "statuses": dict(self.statuses),
            "error_rate_recent": round(1 - sum(window) / len(window), 3) if window else 0.0,
            "p50_ms": int(statistics.median(lat)) if lat else None,
            "p95_ms": int(lat[min(len(lat) - 1, int(len(lat) * 0.95))]) if lat else None,
            "tokens": self.tokens,
            "cost_usd": round(self.cost_usd, 4),
            "by_variant": {v: {"runs": n, "errors": self.variant_errors[v]} for v, n in self.variants.items()},
            "version": self.last_version,
        }


_stats: dict[str, AgentStats] = defaultdict(AgentStats)
_daily_cost: dict[date, float] = defaultdict(float)
_feedback: dict[str, Counter] = defaultdict(Counter)
_last_alert: dict[str, float] = {}


def record_run(agent: str, *, status: str, ms: float, tokens: int, cost: float, variant: str, version: str) -> None:
    s = _stats[agent]
    ok = status == "ok"
    s.runs += 1
    s.statuses[status] += 1
    s.variants[variant] += 1
    if not ok:
        s.variant_errors[variant] += 1
    s.recent_ok.append(1 if ok else 0)
    s.latencies_ms.append(ms)
    s.tokens += tokens
    s.cost_usd += cost
    s.last_version = version
    _daily_cost[date.today()] += cost
    for old in [d for d in _daily_cost if d < date.today()]:
        del _daily_cost[old]
    _check_alerts(agent, s)


def record_feedback(agent: str, rating: str) -> None:
    _feedback[agent][rating] += 1


def _check_alerts(agent: str, s: AgentStats) -> None:
    view = s.view()
    window = len(s.recent_ok)
    if window >= _f("ALERT_MIN_RUNS", "10") and view["error_rate_recent"] >= _f("ALERT_ERROR_RATE", "0.25"):
        alert(f"error_rate:{agent}", f"🔴 {agent}: {view['error_rate_recent']:.0%} of the last {window} runs failed "
                                     f"({dict(s.statuses)}). Version {s.last_version}.")
    if view["p95_ms"] and window >= _f("ALERT_MIN_RUNS", "10") and view["p95_ms"] >= _f("ALERT_P95_MS", "90000"):
        alert(f"latency:{agent}", f"🟠 {agent}: p95 latency {view['p95_ms'] / 1000:.0f}s over the last {window} runs.")
    spend = _daily_cost[date.today()]
    budget = _f("ALERT_DAILY_COST_USD", "5")
    if budget > 0 and spend >= budget:
        alert("daily_cost", f"💸 LLM spend today is ${spend:.4f} (alarm at ${budget:.4f}). "
                            "Throttle or switch off the top spender — see RUNBOOK.md.")


def alert(key: str, text: str) -> None:
    now = time.monotonic()
    if now - _last_alert.get(key, -1e9) < _f("ALERT_COOLDOWN_S", "900"):
        return
    _last_alert[key] = now
    logger.error("ALERT %s", text)
    url = os.getenv("ALERT_WEBHOOK_URL")
    if url:
        try:
            asyncio.get_running_loop().create_task(_post(url, text))
        except RuntimeError:
            pass   # no event loop (CLI / sync test) — the log line is the alert


async def _post(url: str, text: str) -> None:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(url, json={"text": f"[agent-service {os.getenv('APP_ENV', 'dev')}] {text}"})
    except Exception as e:
        logger.error("Alert webhook failed: %s", e)


def snapshot() -> dict:
    return {
        "agents": {name: s.view() for name, s in sorted(_stats.items())},
        "cost_today_usd": round(_daily_cost[date.today()], 4),
        "feedback": {a: dict(c) for a, c in _feedback.items()},
    }


def reset_for_tests(agent: Optional[str] = None) -> None:
    if agent:
        _stats.pop(agent, None)
        return
    _stats.clear()
    _daily_cost.clear()
    _feedback.clear()
    _last_alert.clear()
