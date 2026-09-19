"""
FAQ Answerer Agent — Nodes
"""
from agents.shared.llm import get_llm
from agents.shared.eval import evaluate_rag_answer
from agents.shared.observability import trace_guardrail
from agents.faq.store import retrieve_policy_chunks


async def retrieve_docs(state: dict) -> dict:
    """Node 1: Retrieve relevant company-doc chunks for the question."""
    question = state.get("question", "")
    chunks = await retrieve_policy_chunks(question, top_k=5)

    return {
        "retrieved_chunks": chunks,
        "logs": [f"📚 Retrieved {len(chunks)} relevant policy-doc chunks (score > 0.3)"]
                if chunks else
                ["ℹ️ No relevant policy-doc chunks found (or no docs indexed yet)"],
    }


def answer_question(state: dict) -> dict:
    """Node 2: Answer strictly from retrieved context, citing sources."""
    chunks = state.get("retrieved_chunks", [])
    question = state.get("question", "")

    if not chunks:
        return {
            "answer": "I don't have any indexed company documents covering that yet — "
                      "please check with HR directly, or ask an admin to upload the relevant policy doc.",
            "sources": [],
            "logs": ["⚠️ Answered with a no-context fallback — no matching docs indexed"],
        }

    context = "\n\n".join(f"[{c['title']}]\n{c['text']}" for c in chunks)
    llm = get_llm(temperature=0)
    prompt = f"""Answer the question using ONLY the context below. If the context doesn't fully answer it, say what's missing — don't invent facts.
End with a "Source(s):" line listing the document title(s) you used.

Context:
{context[:4000]}

Question: {question}"""

    response = llm.invoke(prompt)
    text = response.content if hasattr(response, "content") else str(response)
    sources = sorted({c["title"] for c in chunks if c.get("title")})

    return {
        "answer": text,
        "sources": sources,
        "logs": [f"✅ Answered from {len(chunks)} chunk(s) across {len(sources)} doc(s)"],
    }


def eval_answer(state: dict) -> dict:
    """Node 3: RAGAS-style faithfulness/relevancy scoring + Langfuse guardrail trace."""
    question = state.get("question", "")
    chunks = state.get("retrieved_chunks", [])
    answer = state.get("answer", "")

    scores = evaluate_rag_answer(question, chunks, answer)

    trace_guardrail(
        name="faq-answerer",
        input_data={"question": question},
        output_data={"answer": answer, "sources": state.get("sources", [])},
        scores={"faithfulness": scores["faithfulness"], "answer_relevancy": scores["answer_relevancy"]},
        metadata={"num_chunks": len(chunks), "reasoning": scores["reasoning"]},
    )

    low_faithfulness = scores["faithfulness"] < 0.5
    return {
        "faithfulness": scores["faithfulness"],
        "answer_relevancy": scores["answer_relevancy"],
        "eval_reasoning": scores["reasoning"],
        "logs": [
            f"🛡️ Guardrail eval — faithfulness={scores['faithfulness']:.2f}, "
            f"relevancy={scores['answer_relevancy']:.2f}"
            + (" ⚠️ LOW FAITHFULNESS — possible hallucination" if low_faithfulness else "")
        ],
    }
