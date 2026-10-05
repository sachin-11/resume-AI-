"""Interview panel: the three panelists run concurrently and consensus sees all of them."""
import asyncio
import json
import time

from langchain_core.language_models.fake_chat_models import FakeListChatModel

import core.llm
from agents.interview_panel.graph import interview_panel_agent

# One reply that satisfies all three panelist schemas (extra fields are ignored).
REPLY = json.dumps({"technical_score": 80, "communication_score": 70, "domain_score": 60, "verdict": "pass"})
DELAY_S = 0.3


class SlowFake(FakeListChatModel):
    def _call(self, *args, **kwargs):
        time.sleep(DELAY_S)  # async calls run this in a worker thread
        return super()._call(*args, **kwargs)


def test_panelists_run_in_parallel(monkeypatch):
    model = SlowFake(responses=[REPLY])
    monkeypatch.setattr(core.llm, "get_llm", lambda temperature=0.3, tier="reasoning": model)

    started = time.perf_counter()
    out = asyncio.run(interview_panel_agent.ainvoke({
        "resume_text": "cv", "role": "Backend", "qa_pairs": [{"question": "q", "answer": "a"}], "logs": [],
    }))
    elapsed = time.perf_counter() - started

    assert elapsed < DELAY_S * 2, f"took {elapsed:.2f}s — panelists ran one after another"
    report = out["panel_report"]
    assert report["panelScore"] == int(80 * 0.5 + 70 * 0.25 + 60 * 0.25)
    assert report["panelRecommendation"] == "hire"
    # all three panelists' log lines arrived (append reducer, no lost writes)
    assert sum(line.startswith(("🔧", "👥", "🎯")) for line in out["logs"]) == 3
