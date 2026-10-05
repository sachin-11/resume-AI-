import asyncio
from typing import Annotated, TypedDict
import operator

from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langgraph.graph import END, StateGraph

from core.observability import UsageCollector, redact, run_agent, run_config


def test_redact_keeps_shape_not_content():
    data = {"resume": "Priya, 9876543210", "scores": [80, 0.5], "ok": True, "n": None}
    assert redact(data) == {
        "resume": "[redacted — 17 chars]", "scores": [80, 0.5], "ok": True, "n": None,
    }


def test_redact_fails_closed_on_unknown_objects():
    assert redact(AIMessage(content="secret")) == "[redacted AIMessage]"


def test_no_langfuse_handler_when_unconfigured():
    usage = UsageCollector()
    config = run_config("faq-ask", usage, user_id="u1")
    assert config["callbacks"] == [usage]
    assert config["metadata"]["langfuse_trace_name"] == "faq-ask"
    assert config["metadata"]["langfuse_user_id"] == "u1"


def _model_with_usage(n_calls: int):
    return GenericFakeChatModel(messages=iter([
        AIMessage(
            content="ok",
            usage_metadata={"input_tokens": 10, "output_tokens": 3, "total_tokens": 13},
            response_metadata={"model_name": "fake-model"},
        )
        for _ in range(n_calls)
    ]))


def test_run_agent_sums_usage_across_nodes_and_subgraphs():
    model = _model_with_usage(3)

    class S(TypedDict):
        logs: Annotated[list, operator.add]

    async def call(_state):
        await model.ainvoke("hi")
        return {"logs": ["x"]}

    sub = StateGraph(S)
    sub.add_node("inner", call)
    sub.set_entry_point("inner")
    sub.add_edge("inner", END)
    sub = sub.compile()

    async def call_subgraph(state):
        await sub.ainvoke({"logs": []})  # no config passed — must still be counted
        return {"logs": ["sub"]}

    g = StateGraph(S)
    g.add_node("a", call)
    g.add_node("b", call)
    g.add_node("c", call_subgraph)
    g.set_entry_point("a")
    g.add_edge("a", "b")
    g.add_edge("b", "c")
    g.add_edge("c", END)

    _, usage = asyncio.run(run_agent("test", g.compile(), {"logs": []}))
    assert usage["calls"] == 3
    assert usage["input_tokens"] == 30
    assert usage["output_tokens"] == 9
    assert usage["by_model"]["fake-model"]["calls"] == 3


def test_request_id_is_minted_or_propagated():
    import main
    client = TestClient(main.app)

    minted = client.get("/health").headers["x-request-id"]
    assert len(minted) == 32

    assert client.get("/health", headers={"x-request-id": "abc-123"}).headers["x-request-id"] == "abc-123"
    # Junk ids (log injection etc.) are replaced, not echoed
    assert client.get("/health", headers={"x-request-id": "bad id\nINJECT"}).headers["x-request-id"] != "bad id\nINJECT"
