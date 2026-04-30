"""
Interview Evaluator Agent — State

Dynamic interview evaluation:
- Decides if follow-up is needed
- Detects contradictions
- Generates holistic score
"""
from typing import TypedDict, List, Optional, Annotated
import operator


class QAItem(TypedDict):
    question: str
    answer: str
    followUpAsked: bool
    followUpAnswer: Optional[str]
    score: int
    feedback: str


class InterviewEvaluatorState(TypedDict):
    # Input
    session_id: str
    role: str
    round_type: str
    qa_pairs: List[dict]          # [{question, answer}]
    resume_text: Optional[str]

    # Processing
    evaluated_qa: List[QAItem]    # enriched with scores
    current_idx: int              # which Q&A we're evaluating
    contradictions: List[str]     # detected contradictions

    # Output scores
    overall_score: int
    technical_score: int
    communication_score: int
    confidence_score: int
    strengths: List[str]
    weak_areas: List[str]
    improvement_roadmap: List[str]
    summary: str
    hire_recommendation: str      # strong_yes | yes | maybe | no

    logs: Annotated[List[str], operator.add]
