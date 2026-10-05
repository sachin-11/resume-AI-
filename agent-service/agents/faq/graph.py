"""
FAQ Answerer Agent — Graph

Default (ReAct):  [START] → [research_and_answer] → [eval_answer] → [END]
    research_and_answer is itself a small ReAct loop (model ⇄ policy_docs_search, ≤ 3 searches).
Classic baseline: [START] → [retrieve_docs] → [answer_question] → [eval_answer] → [END]
    One search with the raw question. Kept so evals can compare the two.
"""
from langgraph.graph import StateGraph, END
from agents.faq.state import FAQState
from agents.faq.nodes import answer_question, eval_answer, research_and_answer, retrieve_docs


def build_faq_agent():
    workflow = StateGraph(FAQState)

    workflow.add_node("research_and_answer", research_and_answer)
    workflow.add_node("eval_answer", eval_answer)

    workflow.set_entry_point("research_and_answer")
    workflow.add_edge("research_and_answer", "eval_answer")
    workflow.add_edge("eval_answer", END)

    # checkpointer=False: when run as a sub-agent of the checkpointed orchestrator,
    # don't persist this graph's internal steps (duplicate PII, wasted storage).
    return workflow.compile(checkpointer=False)


def build_faq_agent_classic():
    workflow = StateGraph(FAQState)

    workflow.add_node("retrieve_docs", retrieve_docs)
    workflow.add_node("answer_question", answer_question)
    workflow.add_node("eval_answer", eval_answer)

    workflow.set_entry_point("retrieve_docs")
    workflow.add_edge("retrieve_docs", "answer_question")
    workflow.add_edge("answer_question", "eval_answer")
    workflow.add_edge("eval_answer", END)

    return workflow.compile(checkpointer=False)


faq_agent = build_faq_agent()
faq_agent_classic = build_faq_agent_classic()
