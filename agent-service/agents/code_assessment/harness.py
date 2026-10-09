"""
Test harnesses: run one function over a list of inputs inside the sandbox and
report each result as a JSON line tagged with a per-run nonce.

Design choices (each guards against a way a candidate run could go wrong or cheat):
  - Results are only *reported* by the harness; comparing them with the expected
    outputs happens back in agent-service. The expected outputs never enter the
    candidate's sandbox, so code that prints "all tests passed" proves nothing.
  - Only lines carrying the nonce (random per run, generated after the code was
    written) are read; the candidate's own prints are ignored.
  - Each test prints a "start" line before it runs, so when `timeout` kills an
    infinite loop we know exactly which test hung; the runner then restarts from
    the next test (`start_index`).
  - Top-level code in the submission (e.g. the editor's `console.log(solution())`)
    runs inside a try/except, so a crash there doesn't hide the function itself
    (Python and JavaScript; TypeScript runs as one module).
"""
import json
import re
import secrets
from typing import Any, Optional

SUPPORTED = ("python", "javascript", "typescript")

_PY_HARNESS = r'''
import json, sys, time, copy
_NONCE = "{nonce}"
def _norm(v):
    if isinstance(v, (set, frozenset)):
        return sorted((_norm(x) for x in v), key=repr)
    if isinstance(v, tuple):
        return [_norm(x) for x in v]
    if isinstance(v, list):
        return [_norm(x) for x in v]
    if isinstance(v, dict):
        return {{str(k): _norm(x) for k, x in v.items()}}
    return v
def _emit(d):
    d["n"] = _NONCE
    print("\n" + json.dumps(d, default=repr), flush=True)
_ns = {{"__name__": "solution"}}
try:
    exec(compile(open("solution.py").read(), "solution.py", "exec"), _ns)
except BaseException as _e:
    _emit({{"top_level_error": f"{{type(_e).__name__}}: {{_e}}"[:300]}})
_tests = json.load(open("tests.json"))
_entry = "{entry}"
try:
    if "." in _entry:
        _cls, _meth = _entry.split(".", 1)
        _fn = getattr(_ns[_cls](), _meth)
    else:
        _fn = _ns[_entry]
except Exception as _e:
    _emit({{"entry_error": f"{{type(_e).__name__}}: {{_e}}"[:300]}})
    sys.exit(0)
for _i in range(int(sys.argv[1]), len(_tests)):
    _emit({{"i": _i, "start": True}})
    _t = time.perf_counter()
    try:
        _out = _fn(*copy.deepcopy(_tests[_i]))
        _emit({{"i": _i, "ok": True, "out": _norm(_out), "ms": round((time.perf_counter() - _t) * 1000, 2)}})
    except BaseException as _e:
        _emit({{"i": _i, "ok": False, "error": f"{{type(_e).__name__}}: {{_e}}"[:300],
                "ms": round((time.perf_counter() - _t) * 1000, 2)}})
'''

_JS_HARNESS = r'''
const fs = require("fs"), vm = require("vm");
const NONCE = "{nonce}";
const emit = (d) => process.stdout.write("\n" + JSON.stringify({{ ...d, n: NONCE }}) + "\n");
try {{ vm.runInThisContext(fs.readFileSync("solution.js", "utf8"), {{ filename: "solution.js" }}); }}
catch (e) {{ emit({{ top_level_error: String(e && e.name ? `${{e.name}}: ${{e.message}}` : e).slice(0, 300) }}); }}
const tests = JSON.parse(fs.readFileSync("tests.json", "utf8"));
let fn;
try {{ fn = vm.runInThisContext("{entry_js}"); if (typeof fn !== "function") throw new Error("not a function"); }}
catch (e) {{ emit({{ entry_error: String(e).slice(0, 300) }}); process.exit(0); }}
const norm = (v) => (v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v === undefined ? null : v);
for (let i = Number(process.argv[2]); i < tests.length; i++) {{
  emit({{ i, start: true }});
  const t = performance.now();
  try {{
    const out = fn(...structuredClone(tests[i]));
    emit({{ i, ok: true, out: norm(out), ms: Math.round((performance.now() - t) * 100) / 100 }});
  }} catch (e) {{
    emit({{ i, ok: false, error: String(e && e.name ? `${{e.name}}: ${{e.message}}` : e).slice(0, 300),
            ms: Math.round((performance.now() - t) * 100) / 100 }});
  }}
}}
'''

_TS_FOOTER = r'''

// ── harness ──
const __NONCE = "{nonce}";
const __emit = (d: Record<string, unknown>) => console.log("\n" + JSON.stringify({{ ...d, n: __NONCE }}));
const __tests: unknown[][] = JSON.parse(Deno.readTextFileSync("tests.json"));
const __norm = (v: unknown) => (v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v === undefined ? null : v);
for (let __i = Number(Deno.args[0]); __i < __tests.length; __i++) {{
  __emit({{ i: __i, start: true }});
  const __t = performance.now();
  try {{
    // deno-lint-ignore no-explicit-any
    const __out = ({entry_ts} as any)(...structuredClone(__tests[__i]));
    __emit({{ i: __i, ok: true, out: __norm(__out), ms: Math.round((performance.now() - __t) * 100) / 100 }});
  }} catch (e) {{
    __emit({{ i: __i, ok: false, error: String(e instanceof Error ? `${{e.name}}: ${{e.message}}` : e).slice(0, 300),
             ms: Math.round((performance.now() - __t) * 100) / 100 }});
  }}
}}
'''


def build(language: str, code: str, entry: str, tests: list[list[Any]], start: int = 0) -> tuple[dict, str, str]:
    """Files + command for one sandbox run, and the nonce to read results by."""
    nonce = secrets.token_hex(8)
    tests_json = json.dumps(tests)
    if language == "python":
        files = {"solution.py": code, "run.py": _PY_HARNESS.format(nonce=nonce, entry=entry), "tests.json": tests_json}
        return files, f"python3 run.py {start}", nonce
    if language == "javascript":
        entry_js = entry
        if "." in entry:
            cls, meth = entry.split(".", 1)
            entry_js = f"(() => {{ const o = new {cls}(); return o.{meth}.bind(o); }})()"
        files = {"solution.js": code, "run.js": _JS_HARNESS.format(nonce=nonce, entry_js=entry_js), "tests.json": tests_json}
        return files, f"node run.js {start}", nonce
    if language == "typescript":
        entry_ts = entry
        if "." in entry:
            cls, meth = entry.split(".", 1)
            entry_ts = f"(() => {{ const o = new {cls}(); return o.{meth}.bind(o); }})()"
        files = {"solution.ts": code + _TS_FOOTER.format(nonce=nonce, entry_ts=entry_ts), "tests.json": tests_json}
        return files, f"deno run --quiet --allow-read solution.ts {start}", nonce
    raise ValueError(f"Unsupported language: {language}")


def parse(stdout: str, nonce: str) -> list[dict]:
    """The harness's own JSON lines, in order (candidate prints are skipped)."""
    events = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{") or nonce not in line:
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("n") == nonce:
            events.append(event)
    return events


# ── Finding the function to call ─────────────────────────────────

_PY_FN = re.compile(r"^def\s+([A-Za-z_]\w*)\s*\(", re.M)
_PY_CLASS = re.compile(r"^class\s+([A-Za-z_]\w*)\b[^\n]*:\s*\n((?:[ \t]+.*\n?|\s*\n)*)", re.M)
_PY_METHOD = re.compile(r"^[ \t]+def\s+([A-Za-z_]\w*)\s*\(\s*self", re.M)
_JS_FN = re.compile(
    r"(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]"
    r"|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)"
)
_JS_CLASS = re.compile(r"(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{")
_JS_METHOD = re.compile(r"^\s{2,}(?:public\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{", re.M)
_SKIP = {"main", "constructor", "__init__", "print", "log", "test", "tests", "run", "helper"}


def candidate_entries(language: str, code: str) -> list[str]:
    """Callable names defined in the submission: `fn` or `Class.method`."""
    names: list[str] = []
    if language == "python":
        names += _PY_FN.findall(code)
        for cls, body in _PY_CLASS.findall(code):
            names += [f"{cls}.{m}" for m in _PY_METHOD.findall(body) if not m.startswith("_")]
    else:
        names += [a or b for a, b in _JS_FN.findall(code)]
        for m in _JS_CLASS.finditer(code):
            body = code[m.end(): m.end() + 4000]
            names += [f"{m.group(1)}.{x}" for x in _JS_METHOD.findall(body) if x not in _SKIP]
    seen, out = set(), []
    for n in names:
        if n not in seen and n.split(".")[-1] not in _SKIP:
            seen.add(n)
            out.append(n)
    return out


def pick_entry(candidates: list[str], hint: Optional[str]) -> Optional[str]:
    """Deterministic choice when possible; None means "ask the model to choose from `candidates`"."""
    if not candidates:
        return None
    if hint:
        for c in candidates:
            if c.split(".")[-1].lower() == hint.lower():
                return c
    if len(candidates) == 1:
        return candidates[0]
    return None


# ── Comparing outputs ────────────────────────────────────────────

def _close(a: Any, b: Any, tol: float) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b if isinstance(a, bool) and isinstance(b, bool) else False
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= tol * max(1.0, abs(a), abs(b))
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_close(x, y, tol) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_close(a[k], b[k], tol) for k in a)
    return a == b


def _canonical(v: Any) -> str:
    return json.dumps(v, sort_keys=True)


def same(expected: Any, got: Any, mode: str) -> bool:
    if mode == "unordered" and isinstance(expected, list) and isinstance(got, list):
        return sorted(map(_canonical, expected)) == sorted(map(_canonical, got))
    if mode == "unordered_nested" and isinstance(expected, list) and isinstance(got, list):
        def inner(v):
            return sorted(map(_canonical, v)) if isinstance(v, list) else _canonical(v)
        return sorted(map(lambda x: json.dumps(inner(x)), expected)) == sorted(map(lambda x: json.dumps(inner(x)), got))
    return _close(expected, got, 1e-6 if mode == "float" else 0.0)
