"""The eval runner itself: repeats expose flaky cases, and a drop below the committed
baseline fails the run even when the metric is still above its threshold."""
import asyncio
import json

import pytest

import evals.run_evals as R


@pytest.fixture
def runner(tmp_path, monkeypatch):
    monkeypatch.setattr(R, "OUT", tmp_path)
    monkeypatch.setattr(R, "BASELINE", tmp_path / "baseline.json")
    monkeypatch.setattr(R.release, "all_versions", lambda: [])
    monkeypatch.setattr(R.release, "version", lambda agent: {"models": {"x": "fake-model"}})

    def run(suite_fn, repeats=1, update_baseline=False):
        monkeypatch.setitem(R.SUITES, "planner", suite_fn)
        code = asyncio.run(R.main(["planner"], repeats, update_baseline))
        return code, json.loads((tmp_path / "report.json").read_text())
    return run


def test_a_case_that_fails_one_run_in_three_is_flaky_and_lowers_the_score(runner):
    calls = {"n": 0}

    async def suite():
        calls["n"] += 1
        ok = calls["n"] != 2
        rows = [{"case": "steady", "expected": "a", "got": "a", "ok": True},
                {"case": "wobbly", "expected": "a", "got": "a" if ok else "b", "ok": ok}]
        return {"planner_accuracy": sum(r["ok"] for r in rows) / 2}, rows

    code, report = runner(suite, repeats=3)
    assert report["flaky"] == {"planner": ["wobbly"]}
    assert report["metrics"]["planner_accuracy"] == pytest.approx(5 / 6)
    wobbly = next(r for r in report["details"]["planner"] if r["case"] == "wobbly")
    assert (wobbly["passes"], wobbly["runs"], wobbly["got"]) == (2, 3, "b")   # the failing run is shown
    assert code == 1   # 0.83 < 0.85


def test_drop_below_baseline_fails_even_above_threshold(runner):
    async def good():
        return {"planner_accuracy": 1.0}, [{"case": "a", "expected": "x", "got": "x", "ok": True}]

    async def worse():
        return {"planner_accuracy": 0.90}, [{"case": "a", "expected": "x", "got": "x", "ok": True}]

    assert runner(good, update_baseline=True)[0] == 0
    code, report = runner(worse)
    assert code == 1 and report["regressions"] == {"planner_accuracy": [1.0, 0.9]}


def test_failing_run_does_not_overwrite_a_baseline(runner):
    async def good():
        return {"planner_accuracy": 1.0}, [{"case": "a", "expected": "x", "got": "x", "ok": True}]

    async def bad():
        return {"planner_accuracy": 0.5}, [{"case": "a", "expected": "x", "got": "y", "ok": False}]

    runner(good, update_baseline=True)
    runner(bad, update_baseline=True)
    assert json.loads((R.BASELINE).read_text())["metrics"]["planner_accuracy"] == 1.0


def test_first_baseline_is_never_taken_from_a_failing_run(runner):
    async def bad():
        return {"planner_accuracy": 0.5}, [{"case": "a", "expected": "x", "got": "y", "ok": False}]

    runner(bad, update_baseline=True)
    assert not R.BASELINE.exists()
