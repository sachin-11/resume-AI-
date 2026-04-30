"""Shared LLM utility for all agents."""
import os
import json
from typing import Any


def get_llm(temperature: float = 0.3):
    if os.getenv("OPENAI_API_KEY"):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini", temperature=temperature, api_key=os.getenv("OPENAI_API_KEY"))
    from langchain_groq import ChatGroq
    return ChatGroq(model="llama-3.3-70b-versatile", temperature=temperature, api_key=os.getenv("GROQ_API_KEY"))


def safe_json_parse(text: str, fallback: Any) -> Any:
    try:
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        return json.loads(text.strip())
    except Exception:
        return fallback
