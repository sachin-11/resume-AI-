import asyncio

import pytest
from pydantic import BaseModel

from core.llm import ainvoke_structured, extract_json, invoke_structured
from core.types import Score, StrList


class Out(BaseModel):
    score: Score
    tags: StrList = []


FALLBACK = Out(score=0)


# ── extract_json ─────────────────────────────────────────────────

@pytest.mark.parametrize("text", [
    '{"score": 5}',
    '```json\n{"score": 5}\n```',
    '```\n{"score": 5}\n```',
    'Sure! Here is the result:\n{"score": 5}\nHope that helps.',
])
def test_extract_json_tolerates_fences_and_prose(text):
    assert extract_json(text) == {"score": 5}


def test_extract_json_raises_when_no_json():
    with pytest.raises(ValueError):
        extract_json("I cannot help with that.")


# ── structured invocation ────────────────────────────────────────

def test_valid_reply_is_returned(fake_llm):
    fake_llm('{"score": 80, "tags": ["a"]}')
    result = asyncio.run(ainvoke_structured("p", Out, fallback=FALLBACK))
    assert result.data == Out(score=80, tags=["a"])
    assert not result.fallback_used


def test_null_list_becomes_empty(fake_llm):
    fake_llm('{"score": 80, "tags": null}')
    assert asyncio.run(ainvoke_structured("p", Out, fallback=FALLBACK)).data.tags == []


def test_invalid_reply_is_re_asked_then_accepted(fake_llm):
    fake_llm('{"score": 150}', '{"score": 90}')  # 150 is out of range
    result = asyncio.run(ainvoke_structured("p", Out, fallback=FALLBACK))
    assert result.data.score == 90  # second reply → the model was re-asked
    assert not result.fallback_used


def test_persistently_invalid_reply_uses_flagged_fallback(fake_llm):
    fake_llm("not json", "still not json")
    result = asyncio.run(ainvoke_structured("p", Out, fallback=FALLBACK))
    assert result.data is FALLBACK
    assert result.fallback_used
    assert result.error


def test_sync_variant(fake_llm):
    fake_llm("garbage", '{"score": 42}')
    assert invoke_structured("p", Out, fallback=FALLBACK).data.score == 42


def test_json_mode_asks_the_provider_for_a_json_object(monkeypatch):
    import core.llm
    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    class Out(BaseModel):
        ok: bool

    model = FakeListChatModel(responses=['{"ok": true}', '{"ok": true}'])
    bound = []
    real_bind = FakeListChatModel.bind

    def spy(self, **kwargs):
        bound.append(kwargs)
        return real_bind(self, **kwargs)

    monkeypatch.setattr(FakeListChatModel, "bind", spy)
    monkeypatch.setattr(core.llm, "get_llm", lambda temperature=0.3, tier="reasoning": model)
    asyncio.run(core.llm.ainvoke_structured("Return JSON", Out, fallback=Out(ok=False), json_mode=True))
    asyncio.run(core.llm.ainvoke_structured("Return JSON", Out, fallback=Out(ok=False)))
    assert bound == [{"response_format": {"type": "json_object"}}]   # only the opted-in call
