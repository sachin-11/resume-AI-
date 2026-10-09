"""
Pull thumbs-down feedback into the eval review queue.

    cd agent-service && python -m evals.harvest_feedback

Appends every not-yet-exported thumbs-down row from agent_memory.agent_feedback
to evals/review_queue.jsonl (contact details were already masked at storage) and
marks it exported. Then, for each line worth keeping, a person:
  1. fills in the correct outcome ("expected"),
  2. trims the input to what reproduces the mistake (and removes anything personal),
  3. moves the line to evals/regressions.jsonl in one of these shapes:
       {"suite": "planner",   "message": "...", "expected": ["faq"]}
       {"suite": "screening", "name": "...", "resume": "...", "jd": "...", "expected": "reject"}
From then on run_evals gates every prompt/model change on it.
review_queue.jsonl is git-ignored (it holds real user text); regressions.jsonl is committed.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

QUEUE = Path(__file__).resolve().parent / "review_queue.jsonl"
SUGGESTED_SUITE = {"orchestrate": "planner", "screen-candidate": "screening", "bulk-screening": "screening"}


def main() -> int:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set — feedback lives in Postgres (agent_memory.agent_feedback).")
        return 1
    import psycopg
    from psycopg.rows import dict_row
    from core.memory import SCHEMA, _libpq_url

    with psycopg.connect(_libpq_url(url), row_factory=dict_row, options=f"-c search_path={SCHEMA}") as conn:
        rows = conn.execute(
            "SELECT id, agent, version, comment, input, output, created_at FROM agent_feedback "
            "WHERE rating = 'down' AND NOT exported ORDER BY created_at"
        ).fetchall()
        with QUEUE.open("a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps({
                    **{k: r[k] for k in ("id", "agent", "version", "comment", "input", "output")},
                    "created_at": r["created_at"].isoformat(),
                    "suite": SUGGESTED_SUITE.get(r["agent"]),
                    "expected": None,
                }, ensure_ascii=False) + "\n")
        if rows:
            conn.execute("UPDATE agent_feedback SET exported = true WHERE id = ANY(%s)", ([r["id"] for r in rows],))
    print(f"{len(rows)} thumbs-down answer(s) added to {QUEUE.name}. Label them, then move them to regressions.jsonl.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
