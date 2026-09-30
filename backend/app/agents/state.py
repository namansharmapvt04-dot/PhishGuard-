"""
LangGraph typed state shared across all 5 agent nodes.
"""
from __future__ import annotations
from typing import TypedDict, Any
import uuid


class AgentState(TypedDict, total=False):
    # Input
    campaign_id: str
    organization_name: str
    target_department: str
    attack_vector: str
    urgency_level: str          # low | medium | high

    # Campaign Planner output
    sender_persona: str
    sender_name: str
    sender_email: str
    urgency_trigger: str
    fear_factor: str
    plan_reasoning: str

    # RAG retrieved patterns (few-shot context)
    rag_patterns: list[dict[str, Any]]

    # Template Generator output
    email_subject: str
    email_body: str             # contains {first_name}, {department}, etc.

    # Realism Evaluator output
    ragas_score: float
    eval_passed: bool
    eval_feedback: str
    retry_count: int

    # Personalisation targets (list of target dicts)
    targets: list[dict[str, Any]]

    # Personalised emails keyed by target_id
    personalised_emails: dict[str, dict[str, str]]

    # Insight Analyst output
    insights: dict[str, Any]

    # Error propagation
    error: str | None
    should_escalate: bool
