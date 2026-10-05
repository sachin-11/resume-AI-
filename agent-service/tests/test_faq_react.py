"""ReAct FAQ agent: re-searches when needed, stays grounded, respects the step limit and tool allowlist."""
import asyncio

import pytest
from langchain_core.messages import AIMessage, ToolMessage

import agents.faq.nodes as faq_nodes
import core.tools
from agents.faq.nodes import MAX_SEARCHES, NO_CONTEXT_ANSWER, research_and_answer
from core.tools import tools_for

LEAVE = {"title": "Leave Policy", "text": "18 paid leaves per year; up to 5 unused days carry forward.", "score": 0.8}


def search_call(query: str, call_id: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": "policy_docs_search", "args": {"query": query}, "id": call_id}])


@pytest.fixture
def docs(monkeypatch):
    """Fake policy search: returns LEAVE only for queries mentioning 'leave'; records queries."""
    queries = []

    def search(query, top_k=5):
        queries.append(query)
        return [LEAVE] if "leave" in query.lower() else []

    monkeypatch.setattr("agents.faq.store.retrieve_policy_chunks_sync", search)
    for spec in core.tools._REGISTRY.values():
        spec.breaker.failures, spec.breaker.opened_at = 0, None
    return queries


def use_model(monkeypatch, model):
    monkeypatch.setattr(faq_nodes, "get_llm", lambda temperature=0.3, tier="reasoning": model)


def test_rephrases_and_searches_again_when_first_search_misses(monkeypatch, docs, scripted_tool_model):
    model = scripted_tool_model(
        search_call("How many vacation days can I carry over?", "1"),   # misses
        search_call("leave carry forward policy", "2"),                 # hits
        AIMessage(content="Up to 5 unused days carry forward.\nSource(s): Leave Policy"),
    )
    use_model(monkeypatch, model)

    out = asyncio.run(research_and_answer({"question": "How many vacation days can I carry over?"}))

    assert docs == ["How many vacation days can I carry over?", "leave carry forward policy"]
    assert out["sources"] == ["Leave Policy"]
    assert out["retrieved_chunks"][0]["title"] == "Leave Policy"
    assert "5 unused days" in out["answer"]
    # the model read the documents fenced as untrusted data
    tool_results = [m for m in model.seen[-1] if isinstance(m, ToolMessage)]
    assert "<documents>" in tool_results[-1].content


def test_answer_without_any_document_is_replaced_by_grounded_fallback(monkeypatch, docs, scripted_tool_model):
    use_model(monkeypatch, scripted_tool_model(AIMessage(content="You get 30 days, I think.")))
    out = asyncio.run(research_and_answer({"question": "What is the notice period?"}))
    assert out["answer"] == NO_CONTEXT_ANSWER and out["sources"] == []


def test_search_loop_is_capped_even_after_finding_documents(monkeypatch, docs, scripted_tool_model):
    # Every search finds the leave policy, but the model never stops searching.
    endless = [search_call(f"leave attempt {i}", str(i)) for i in range(MAX_SEARCHES + 5)]
    use_model(monkeypatch, scripted_tool_model(*endless))
    out = asyncio.run(research_and_answer({"question": "anything"}))
    assert len(docs) <= MAX_SEARCHES
    # the library's "Sorry, need more steps" text is never passed off as an answer
    assert out["answer"] == NO_CONTEXT_ANSWER
    assert any("step limit" in line for line in out["logs"])


def test_react_tools_respect_the_registry_allowlist():
    faq = {t.name for t in tools_for("faq")}
    screening = {t.name for t in tools_for("candidate_screening")}
    assert faq == {"policy_docs_search"}
    assert "policy_docs_search" not in screening
    assert {"github_repos_mcp", "github_repos_http"} <= screening


def test_tool_failure_reaches_the_model_as_text(monkeypatch, docs, scripted_tool_model):
    def broken(query, top_k=5):
        raise RuntimeError("pinecone down")

    monkeypatch.setattr("agents.faq.store.retrieve_policy_chunks_sync", broken)
    model = scripted_tool_model(search_call("leave policy", "1"), AIMessage(content="I couldn't check the policies."))
    use_model(monkeypatch, model)

    out = asyncio.run(research_and_answer({"question": "leave policy?"}))
    tool_msg = [m for m in model.seen[-1] if isinstance(m, ToolMessage)][0]
    assert "Tool error" in tool_msg.content          # the agent saw the failure instead of crashing
    assert out["answer"] == NO_CONTEXT_ANSWER        # and nothing ungrounded was returned
