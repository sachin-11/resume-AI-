"""
Agent releases — what exactly is running, and how to go back.

An agent version is: models + prompt code + tools + KB config. All four live in
git: prompts are code in agents/**, tools are registered in agents/shared/tools.py,
and the models + KB config are pinned per environment in releases.json:

    aliases.dev / aliases.staging / aliases.prod   → {release, models, kb, canary}

The service picks its alias from AGENT_RELEASE_ALIAS, else from APP_ENV
(development → dev, staging → staging, production → prod). A model env var
(OPENAI_FAST_MODEL, …) still overrides the pin — an emergency lever, and the
fingerprint reports the model actually used, so an override can't hide.

Every run is tagged with a short fingerprint of its version (Langfuse tag, log
line, `usage.version` in the response), so a bad trace points at the exact
prompt/model/tools/KB combination that produced it.

CLI (edit releases.json, then commit + deploy):
    python -m core.release show [alias]
    python -m core.release fingerprint            # every agent, current alias
    python -m core.release promote staging prod   # prod := staging (old prod kept in history)
    python -m core.release rollback prod          # prod := its previous entry
"""
import hashlib
import json
import os
import random
import sys
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

ROOT = Path(__file__).resolve().parent.parent
RELEASES_FILE = ROOT / "releases.json"
HISTORY_LIMIT = 20

Variant = Literal["stable", "canary"]
# Set per run by run_agent; the LLM gateway builds canary models when it says so.
variant_var: ContextVar[Variant] = ContextVar("llm_variant", default="stable")

_ENV_TO_ALIAS = {"production": "prod", "prod": "prod", "staging": "staging"}

# Prompt code each agent run depends on (agent name as passed to run_agent).
_SHARED_CODE = ["core/llm.py", "core/guardrails.py", "core/types.py", "agents/shared"]
AGENT_CODE: dict[str, list[str]] = {
    "improve-resume": ["agent"],
    "screen-candidate": ["agents/candidate_screening"],
    "learning-path": ["agents/learning_path"],
    "panel-interview": ["agents/interview_panel"],
    "market-intelligence": ["agents/market_intelligence"],
    "daily-ops": ["agents/daily_ops"],
    "job-match": ["agents/job_match"],
    "auto-apply": ["agents/auto_apply"],
    "orchestrate": ["agents/orchestrator", "agents/candidate_screening", "agents/scheduler", "agents/faq"],
    "hiring-committee": ["agents/hiring_committee"],
    "bulk-screening": ["agents/bulk_screening", "agents/candidate_screening"],
    "code-assessment": ["agents/code_assessment"],
}
# Runs that are a continuation of another agent's run share its version and flags.
AGENT_FAMILY = {"orchestrate-resume": "orchestrate"}


def family(agent: str) -> str:
    return AGENT_FAMILY.get(agent, agent)


# ── Active release ───────────────────────────────────────────────

def _load() -> dict:
    return json.loads(RELEASES_FILE.read_text(encoding="utf-8"))


def alias_name() -> str:
    explicit = os.getenv("AGENT_RELEASE_ALIAS")
    if explicit:
        return explicit
    return _ENV_TO_ALIAS.get(os.getenv("APP_ENV", "development").lower(), "dev")


@lru_cache(maxsize=1)
def active() -> dict:
    name = alias_name()
    aliases = _load()["aliases"]
    if name not in aliases:
        raise RuntimeError(f"releases.json has no alias '{name}' (have: {sorted(aliases)})")
    return {"alias": name, **aliases[name]}


def pinned_model(key: str) -> str:
    """Model for e.g. "openai_fast": env override (OPENAI_FAST_MODEL) wins over the pin."""
    return os.getenv(f"{key.upper()}_MODEL") or active()["models"][key]


def canary_model(key: str) -> Optional[str]:
    return (active().get("canary") or {}).get("models", {}).get(key)


def kb_config() -> dict:
    return dict(active()["kb"])


def pick_variant() -> Variant:
    """Per run: "canary" for CANARY_PERCENT (or the alias's canary.percent) of runs."""
    canary = active().get("canary") or {}
    if not canary.get("models"):
        return "stable"
    percent = float(os.getenv("CANARY_PERCENT", canary.get("percent", 0)))
    return "canary" if random.random() * 100 < percent else "stable"


# ── Fingerprint ──────────────────────────────────────────────────

@lru_cache(maxsize=64)
def _code_hash(paths: tuple[str, ...]) -> str:
    digest = hashlib.sha256()
    files: list[Path] = []
    for p in paths:
        target = ROOT / p
        files += sorted(target.rglob("*.py")) if target.is_dir() else [target]
    for f in files:
        if f.exists():
            digest.update(f.relative_to(ROOT).as_posix().encode())
            digest.update(f.read_bytes().replace(b"\r\n", b"\n"))
    return digest.hexdigest()[:12]


def _models(variant: Variant) -> dict:
    from core.config import get_settings  # lazy: config imports this module
    s = get_settings()
    resolved = {
        "openai_fast": s.openai_fast_model, "openai_reasoning": s.openai_reasoning_model,
        "groq_fast": s.groq_fast_model, "groq_reasoning": s.groq_reasoning_model,
    }
    if variant == "canary":
        resolved = {k: canary_model(k) or v for k, v in resolved.items()}
    providers = s.providers
    return {k: v for k, v in resolved.items() if k.split("_")[0] in providers} or resolved


@lru_cache(maxsize=64)
def version(agent: str, variant: Variant = "stable") -> dict:
    """The full version manifest of one agent, plus a short fingerprint of it."""
    from core import tools
    import agents.shared.tools  # noqa: F401  (registers the tools)

    name = family(agent)
    packages = AGENT_CODE.get(name, [])
    tool_owners = {Path(p).name for p in packages}
    manifest = {
        "agent": name,
        "alias": active()["alias"],
        "release": active()["release"],
        "variant": variant,
        "models": _models(variant),
        "prompt_hash": _code_hash(tuple(packages + _SHARED_CODE)),
        "tools": sorted(t["name"] for t in tools.inventory() if tool_owners & set(t["agents"])),
    }
    if "faq" in tool_owners:
        manifest["kb"] = kb_config()
    body = json.dumps({k: v for k, v in manifest.items() if k != "variant"}, sort_keys=True)
    manifest["fingerprint"] = hashlib.sha256(body.encode()).hexdigest()[:12]
    return manifest


def all_versions() -> list[dict]:
    return [version(agent) for agent in AGENT_CODE]


# ── CLI ──────────────────────────────────────────────────────────

def _save(data: dict) -> None:
    RELEASES_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def promote(source: str, target: str) -> dict:
    data = _load()
    aliases = data["aliases"]
    if source not in aliases or target not in aliases:
        raise SystemExit(f"Unknown alias — have: {sorted(aliases)}")
    history = data.setdefault("history", {}).setdefault(target, [])
    history.append(aliases[target])
    del history[:-HISTORY_LIMIT]
    aliases[target] = json.loads(json.dumps(aliases[source]))
    _save(data)
    return aliases[target]


def rollback(target: str) -> dict:
    data = _load()
    history = data.get("history", {}).get(target) or []
    if not history:
        raise SystemExit(f"No history for '{target}' — nothing to roll back to.")
    data["aliases"][target] = history.pop()
    _save(data)
    return data["aliases"][target]


def _main(argv: list[str]) -> None:
    cmd, *args = argv or ["show"]
    if cmd == "show":
        name = args[0] if args else alias_name()
        print(json.dumps(_load()["aliases"][name], indent=2))
    elif cmd == "fingerprint":
        for v in all_versions():
            print(f"{v['agent']:<22} {v['fingerprint']}  prompts={v['prompt_hash']}  models={sorted(set(v['models'].values()))}")
    elif cmd == "promote" and len(args) == 2:
        entry = promote(*args)
        print(f"{args[1]} is now release {entry['release']}. Commit releases.json and deploy.")
    elif cmd == "rollback" and len(args) == 1:
        entry = rollback(args[0])
        print(f"{args[0]} rolled back to release {entry['release']}. Commit releases.json and deploy.")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    _main(sys.argv[1:])
