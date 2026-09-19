"""
FAQ Answerer Agent — State
"""
from typing import TypedDict, List, Annotated
import operator


class FAQState(TypedDict):
    question: str
    retrieved_chunks: List[dict]   # [{title, text, score}]
    answer: str
    sources: List[str]

    # Guardrail / eval (RAGAS-style)
    faithfulness: float
    answer_relevancy: float
    eval_reasoning: str

    logs: Annotated[List[str], operator.add]
