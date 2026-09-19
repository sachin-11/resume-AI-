"""
FAQ Answerer Agent — Graph

[START] → [retrieve_docs] → [answer_question] → [eval_answer] → [END]
"""
from langgraph.graph import StateGraph, END
from agents.faq.state import FAQState
from agents.faq.nodes import retrieve_docs, answer_question, eval_answer


def build_faq_agent():
    workflow = StateGraph(FAQState)

    workflow.add_node("retrieve_docs", retrieve_docs)
    workflow.add_node("answer_question", answer_question)
    workflow.add_node("eval_answer", eval_answer)

    workflow.set_entry_point("retrieve_docs")
    workflow.add_edge("retrieve_docs", "answer_question")
    workflow.add_edge("answer_question", "eval_answer")
    workflow.add_edge("eval_answer", END)

    return workflow.compile()


faq_agent = build_faq_agent()
