"""
Lightweight RAG evaluation — RAGAS-style metrics via LLM-as-judge.

Implements the two most load-bearing RAGAS metrics (faithfulness, answer relevancy)
as a single structured LLM call, instead of pulling in the full `ragas` package
(heavy deps: datasets, sentence-transformers, etc). Good enough to gate a guardrail;
swap for real `ragas` if you need publication-grade eval numbers.
"""
from agents.shared.llm import get_llm, safe_json_parse


async def evaluate_rag_answer(question: str, context_chunks: list, answer: str) -> dict:
    """Score an answer for faithfulness (grounded in context, no hallucination)
    and answer relevancy (actually addresses the question)."""
    if not context_chunks:
        return {"faithfulness": 0.0, "answer_relevancy": 0.0, "reasoning": "No context retrieved"}

    context = "\n\n".join(
        c.get("text", "") if isinstance(c, dict) else str(c) for c in context_chunks
    )
    llm = get_llm(temperature=0)

    prompt = f"""Score this RAG answer on two metrics, each 0.0-1.0. Return ONLY valid JSON:
{{
  "faithfulness": 0.9,
  "answer_relevancy": 0.85,
  "reasoning": "one short sentence"
}}

faithfulness: does the answer ONLY state things supported by the context (no hallucinated facts)?
answer_relevancy: does the answer actually address the question asked?

Context:
{context[:3000]}

Question: {question}

Answer:
{answer[:1500]}"""

    response = await llm.ainvoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, "content") else str(response),
        {"faithfulness": 0.5, "answer_relevancy": 0.5, "reasoning": "Eval parse failed"},
    )
    return {
        "faithfulness": float(result.get("faithfulness", 0.5)),
        "answer_relevancy": float(result.get("answer_relevancy", 0.5)),
        "reasoning": result.get("reasoning", ""),
    }
