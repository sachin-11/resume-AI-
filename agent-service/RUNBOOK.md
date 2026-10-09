# agent-service runbook

| | |
|---|---|
| **Owner** | Sachin |
| **On-call** | Sachin (primary). Add a secondary here before real customers rely on this. |
| **Runs on** | Render — `https://resume-ai-wx2p.onrender.com` (root dir `agent-service/`). The Next.js app (Amplify, `AGENT_SERVICE_URL`) calls it. Free tier: sleeps when idle, first request ~45s. |
| **Alerts go to** | `ALERT_WEBHOOK_URL` (Slack/Discord incoming webhook) + `ERROR ALERT …` log lines |
| **Traces** | Langfuse — filter by tag `agent:<name>`, `request:<id>`, `version:<fingerprint>` |

## 1. Where to look first

| Question | Look at |
|---|---|
| Is it up? Which release? | `GET /health` |
| What exactly is each agent running? | `GET /version` — models, prompt-code hash, tools, KB config, fingerprint per agent |
| Error rate, p95 latency, cost, canary vs stable | `GET /admin/metrics` (this replica) · Langfuse (all replicas) |
| Which agents are switched off / circuit open? | `GET /admin/flags`, `circuits` in `/admin/metrics` |
| Who did what (tool calls, approvals, flag changes)? | `GET /admin/audit?event=tool_call` · `agent.audit` log lines |
| Why did one request fail? | `x-request-id` response header → Langfuse tag `request:<id>` / log lines `[req=<id>]` |

Admin endpoints need a token for a user with role `admin`. To call them by hand:

```bash
TOKEN=$(python -c "import jwt,time,os;n=int(time.time());print(jwt.encode({'iss':'resume-ai-web','aud':'agent-service','sub':'oncall','role':'admin','iat':n,'exp':n+120},os.environ['AGENT_SECRET'],algorithm='HS256'))")
curl -H "Authorization: Bearer $TOKEN" $AGENT_URL/admin/metrics
```

## 2. Deploy

1. Open a PR. CI runs the unit tests (fake LLM) and, **if the PR touches prompts, models,
   guardrails, tools, `releases.json` or eval cases, the real-LLM eval gate** against the prod alias.
   A metric below its threshold fails the PR (`evals/report.md` is attached as an artifact).
2. Merge → Render deploys `master` (check Render → Settings: branch `master`, Auto-Deploy on). Confirm with
   `GET /health` → `release` shows the expected alias and release.
3. Watch `/admin/metrics` and the Langfuse `version:<new fingerprint>` traces for 15 minutes.

### Changing a model (or any release setting)

Models and KB config are pinned per environment in `releases.json` (`dev` / `staging` / `prod`).

1. Edit `aliases.staging` (e.g. a new model snapshot), open a PR — the eval gate runs.
2. Optional canary in prod: set `aliases.prod.canary = {"percent": 10, "models": {"openai_reasoning": "<new>"}}`.
   10% of runs use it; compare `by_variant` in `/admin/metrics` and Langfuse tag `variant:canary`.
3. Promote: `python -m core.release promote staging prod`, commit, merge.

Always pin dated snapshots (`gpt-4o-mini-2024-07-18`), never moving aliases (`gpt-4o-mini`),
so the provider can't change the model under us. New models need a price in `core/pricing.py`
**and** `lib/pricing.ts` (unknown models are budgeted at the most expensive known price).

Changing `kb.chunk_words`, `kb.overlap_words` or `kb.embedding_model` needs every policy doc
re-ingested (`POST /faq/ingest`) — old vectors were built with the old settings.

## 3. Rollback

| What went wrong | Do this |
|---|---|
| Bad code / prompt change | Render → Events → previous successful deploy → **Rollback**. Then `git revert` the PR. |
| Bad model / KB release | `python -m core.release rollback prod`, commit, push. |
| Need it fixed *now*, no deploy | Set `OPENAI_REASONING_MODEL` / `OPENAI_FAST_MODEL` / `GROQ_*_MODEL` on Render (overrides the pin; restart). |
| Agent is doing damage | Kill switch (below) first, then roll back. |

## 4. Kill switch

```bash
# off: every run refused with 503      read_only: answers yes, side effects (bookings, FAQ indexing) no
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode":"off","reason":"cost spike"}' $AGENT_URL/admin/flags/bulk-screening
# all agents: use "*" as the agent name.  Back on: {"mode":"on"}
```

Takes effect on every replica within 5 seconds, stored in Postgres (`agent_memory.agent_flags`),
recorded in the audit log. If Postgres itself is down: set `AGENT_KILL_SWITCH=bulk-screening`
(or `*`) on Render — env always wins. `AGENT_READ_ONLY=…` does the same for read-only.

Agent names: `improve-resume, screen-candidate, learning-path, panel-interview, market-intelligence,
daily-ops, job-match, auto-apply, orchestrate, hiring-committee, bulk-screening`, plus `faq` (indexing).

## 5. Alerts and what to do

| Alert | Likely cause | Action |
|---|---|---|
| 🔴 `error_rate:<agent>` | Provider outage, bad deploy, schema change | Check the statuses in the alert. `timeout`/`error` across all agents → provider (`/health`, provider status page; the gateway already falls back OpenAI → Groq). One agent only, right after a deploy → roll back. |
| ⛔ `breaker:<agent>` | 5 failed runs in a row; agent paused 60s, then one trial run | Same as above. The breaker closes by itself after a successful run. |
| 🟠 `latency:<agent>` | Provider slow, Groq rate limiting (`GROQ_MAX_RPS`), big fan-out | Langfuse → slowest spans. Lower `COMMITTEE_MAX_CONCURRENCY`, or move load to OpenAI. |
| 💸 `daily_cost` | Abuse, a loop, a pricier model | `/admin/metrics` → `cost_usd` per agent → throttle or switch off the top spender; check `budget_exceeded` counts and Langfuse for repeated calls. |

## 6. Limits and throttling (Render env vars)

| Variable | Default | Effect |
|---|---|---|
| `AGENT_RUN_TIMEOUT_S` | 150 | Wall-clock limit per run (fan-out agents: 540) |
| `AGENT_RUN_MAX_TOKENS` | 150000 | Token budget per run (bulk-screening 2M, hiring-committee 1M) |
| `AGENT_RUN_MAX_COST_USD` | 0.50 | $ budget per run (bulk-screening $3, hiring-committee $2) |
| `AGENT_RUN_RECURSION_LIMIT` | 40 | Max graph steps — loop guard |
| `AGENT_LIMITS` | – | Per-agent JSON override, e.g. `{"bulk-screening": {"max_cost_usd": 5}}` |
| `AGENT_BREAKER_THRESHOLD` / `_COOLDOWN_S` | 5 / 60 | Agent circuit breaker |
| `AGENT_USER_RPM` / `AGENT_USER_BURST` | 30 / 10 | Per-user run rate limit |
| `GROQ_MAX_RPS` / `OPENAI_MAX_RPS` | 0.5 / 0 | Client-side provider rate limit |
| `COMMITTEE_MAX_CONCURRENCY` | 8 | Parallel LLM calls in fan-out agents |
| `MAX_TOOL_OUTPUT_CHARS` | 6000 | Tool output the model reads per call |
| `ALERT_WEBHOOK_URL` | – | Where alerts are POSTed |
| `ALERT_ERROR_RATE` / `ALERT_MIN_RUNS` | 0.25 / 10 | Error-rate alert over the last 50 runs |
| `ALERT_P95_MS` | 90000 | Latency alert |
| `ALERT_DAILY_COST_USD` | 5 | Cost alarm (0 = off) |
| `ALERT_COOLDOWN_S` | 900 | Same alert at most once per window |
| `APP_ENV` / `AGENT_RELEASE_ALIAS` | – | Which `releases.json` alias runs (production → prod) |
| `CANARY_PERCENT` | alias value | Override the canary share |

A run stopped by a guard returns `{"detail", "code"}`: `budget_exceeded` (422), `loop_limit` (422),
`timeout` (504), `agent_unavailable` (503).

## 7. Weekly routine (feedback → evals)

1. `python -m evals.harvest_feedback` — new thumbs-down answers → `evals/review_queue.jsonl` (git-ignored).
2. For each real mistake: write the correct outcome, cut the input down to what reproduces it
   (nothing personal), move it to `evals/regressions.jsonl`, commit. It is now a gated eval case.
3. Glance at the Monday scheduled eval run (catches provider-side model drift).
4. Check `/admin/metrics` → `feedback` (up/down per agent) against last week.
