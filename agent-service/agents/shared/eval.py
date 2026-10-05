"""
Lightweight RAG evaluation — RAGAS-style metrics via LLM-as-judge.

Implements the two most load-bearing RAGAS metrics (faithfulness, answer relevancy)
as a single structured LLM call, instead of pulling in the full `ragas` package
(heavy deps: datasets, sentence-transformers, etc). Good enough to gate a guardrail;
swap for real `ragas` if you need publication-grade eval numbers.
"""
from pydantic import BaseModel

from core.llm import ainvoke_structured
from core.types import UnitScore


class RagScores(BaseModel):
    faithfulness: UnitScore
    answer_relevancy: UnitScore
    reasoning: str = ""


async def evaluate_rag_answer(question: str, context_chunks: list, answer: str) -> dict:
    """Score an answer for faithfulness (grounded in context, no hallucination)
    and answer relevancy (actually addresses the question)."""
    if not context_chunks:
        return {"faithfulness": 0.0, "answer_relevancy": 0.0, "reasoning": "No context retrieved"}

    context = "\n\n".join(
        c.get("text", "") if isinstance(c, dict) else str(c) for c in context_chunks
    )

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

    # If the judge's reply is unusable, score 0.0 so the faithfulness guardrail
    # (< 0.5 → human review) trips. A neutral 0.5 here would silently pass an
    # answer nobody actually evaluated.
    result = await ainvoke_structured(
        prompt,
        RagScores,
        fallback=RagScores(faithfulness=0.0, answer_relevancy=0.0, reasoning="Eval failed — judge reply invalid"),
        tier="fast",
        temperature=0,
        name="eval.rag_judge",
    )
    return result.data.model_dump()
