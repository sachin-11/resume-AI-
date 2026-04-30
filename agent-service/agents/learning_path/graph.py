"""
Personalized Learning Path Agent — Graph

[START] → [analyze_gaps] → [prioritize_topics] → [generate_resources] → [build_plan] → [END]
                                                         ↑
                                              loops if more topics remain
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Optional, Annotated
import operator
from agents.shared.llm import get_llm, safe_json_parse


class LearningPathState(TypedDict):
    # Input
    weak_areas: List[str]
    current_skills: List[str]
    target_role: str
    experience_level: str          # junior | mid | senior
    available_hours_per_week: int

    # Processing
    prioritized_topics: List[dict] # [{topic, priority, estimated_hours}]
    current_topic_idx: int
    resources_per_topic: List[dict]

    # Output
    learning_plan: dict
    total_weeks: int
    logs: Annotated[List[str], operator.add]


def analyze_gaps(state: LearningPathState) -> dict:
    llm = get_llm()
    prompt = f"""Analyze skill gaps for a {state.get('experience_level', 'mid')} {state.get('target_role', 'Developer')}.
Return ONLY valid JSON:
{{
  "prioritized_topics": [
    {{
      "topic": "Docker & Containerization",
      "priority": "high",
      "why": "Required for most senior roles",
      "estimated_hours": 20,
      "prerequisites": ["Linux basics"]
    }}
  ]
}}

Weak areas: {state.get('weak_areas', [])}
Current skills: {state.get('current_skills', [])}
Available hours/week: {state.get('available_hours_per_week', 10)}"""

    response = llm.invoke(prompt)
    result = safe_json_parse(
        response.content if hasattr(response, 'content') else str(response),
        {"prioritized_topics": []}
    )
    topics = result.get("prioritized_topics", [])
    return {
        "prioritized_topics": topics,
        "current_topic_idx": 0,
        "logs": [f"📚 Identified {len(topics)} topics to learn"]
    }


def generate_resources(state: LearningPathState) -> dict:
    llm = get_llm()
    topics = state.get("prioritized_topics", [])
    level = state.get("experience_level", "mid")
    role = state.get("target_role", "Developer")

    resources = []
    for topic in topics[:5]:  # limit to 5 topics
        prompt = f"""Suggest learning resources for "{topic.get('topic', '')}" for a {level} {role}.
Return ONLY valid JSON:
{{
  "topic": "{topic.get('topic', '')}",
  "resources": [
    {{
      "type": "video|article|course|book|practice",
      "title": "resource title",
      "url": "url or search query",
      "duration": "2 hours",
      "free": true
    }}
  ],
  "practice_project": "Build a Docker-containerized Node.js app",
  "milestone": "Can containerize any application independently"
}}"""

        response = llm.invoke(prompt)
        result = safe_json_parse(
            response.content if hasattr(response, 'content') else str(response),
            {"topic": topic.get("topic", ""), "resources": [], "practice_project": "", "milestone": ""}
        )
        resources.append(result)

    return {
        "resources_per_topic": resources,
        "logs": [f"🔗 Generated resources for {len(resources)} topics"]
    }


def build_learning_plan(state: LearningPathState) -> dict:
    topics = state.get("prioritized_topics", [])
    resources = state.get("resources_per_topic", [])
    hours_per_week = state.get("available_hours_per_week", 10)

    total_hours = sum(t.get("estimated_hours", 10) for t in topics)
    total_weeks = max(1, round(total_hours / hours_per_week))

    # Build week-by-week plan
    weeks = []
    current_week = 1
    for i, topic in enumerate(topics[:5]):
        topic_hours = topic.get("estimated_hours", 10)
        topic_weeks = max(1, round(topic_hours / hours_per_week))
        resource = resources[i] if i < len(resources) else {}

        weeks.append({
            "week": f"Week {current_week}-{current_week + topic_weeks - 1}" if topic_weeks > 1 else f"Week {current_week}",
            "topic": topic.get("topic", ""),
            "priority": topic.get("priority", "medium"),
            "hours": topic_hours,
            "resources": resource.get("resources", [])[:3],
            "practiceProject": resource.get("practice_project", ""),
            "milestone": resource.get("milestone", ""),
        })
        current_week += topic_weeks

    plan = {
        "targetRole": state.get("target_role", ""),
        "experienceLevel": state.get("experience_level", "mid"),
        "totalWeeks": total_weeks,
        "totalHours": total_hours,
        "hoursPerWeek": hours_per_week,
        "weeklyPlan": weeks,
        "topicsCount": len(topics),
        "logs": state.get("logs", []),
    }

    return {
        "learning_plan": plan,
        "total_weeks": total_weeks,
        "logs": [f"🗓️ Learning plan: {total_weeks} weeks, {total_hours} hours total"]
    }


def build_learning_path_agent():
    workflow = StateGraph(LearningPathState)
    workflow.add_node("analyze_gaps",       analyze_gaps)
    workflow.add_node("generate_resources", generate_resources)
    workflow.add_node("build_plan",         build_learning_plan)

    workflow.set_entry_point("analyze_gaps")
    workflow.add_edge("analyze_gaps",       "generate_resources")
    workflow.add_edge("generate_resources", "build_plan")
    workflow.add_edge("build_plan",         END)

    return workflow.compile()


learning_path_agent = build_learning_path_agent()
