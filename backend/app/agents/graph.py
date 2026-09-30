"""
LangGraph pipeline — wires the 5 nodes together with conditional edges
for retry and escalation logic.
"""
import structlog
from langgraph.graph import StateGraph, END

from app.agents.state import AgentState
from app.agents.campaign_planner import campaign_planner_node
from app.agents.template_generator import template_generator_node
from app.agents.realism_evaluator import realism_evaluator_node, should_retry_or_continue
from app.agents.personalisation_agent import personalisation_agent_node
from app.agents.insight_analyst import insight_analyst_node

log = structlog.get_logger(__name__)


# ── Retry wrapper node ──────────────────────────────────────────────────────

async def increment_retry_node(state: AgentState) -> AgentState:
    """Increments retry counter and clears previous template so generator re-runs."""
    return {
        **state,
        "retry_count": state.get("retry_count", 0) + 1,
        "email_subject": None,
        "email_body": None,
    }


async def escalate_node(state: AgentState) -> AgentState:
    """Marks the campaign as escalated — human review needed."""
    log.warning(
        "pipeline.escalated",
        campaign_id=state.get("campaign_id"),
        score=state.get("ragas_score"),
        retries=state.get("retry_count"),
        error=state.get("error"),
    )
    return {**state, "should_escalate": True}


# ── Build graph ─────────────────────────────────────────────────────────────

def build_generation_pipeline() -> StateGraph:
    """
    Returns a compiled LangGraph for campaign email generation.

    Flow:
      plan → generate → evaluate
                            ↓ pass        ↓ retry (< MAX_RETRIES)   ↓ escalate
                       personalise    increment → generate → evaluate
                            ↓
                           END
    """
    graph = StateGraph(AgentState)

    # Register nodes
    graph.add_node("plan", campaign_planner_node)
    graph.add_node("generate", template_generator_node)
    graph.add_node("evaluate", realism_evaluator_node)
    graph.add_node("increment_retry", increment_retry_node)
    graph.add_node("personalise", personalisation_agent_node)
    graph.add_node("escalate", escalate_node)

    # Linear edges
    graph.set_entry_point("plan")
    graph.add_edge("plan", "generate")
    graph.add_edge("generate", "evaluate")
    graph.add_edge("increment_retry", "generate")   # retry loop
    graph.add_edge("personalise", END)
    graph.add_edge("escalate", END)

    # Conditional edge from evaluator
    graph.add_conditional_edges(
        "evaluate",
        should_retry_or_continue,
        {
            "personalise": "personalise",
            "retry": "increment_retry",
            "escalate": "escalate",
        },
    )

    return graph.compile()


def build_insight_pipeline() -> StateGraph:
    """Separate pipeline for post-campaign analysis."""
    graph = StateGraph(AgentState)
    graph.add_node("analyse", insight_analyst_node)
    graph.set_entry_point("analyse")
    graph.add_edge("analyse", END)
    return graph.compile()


# Singleton compiled pipelines
generation_pipeline = build_generation_pipeline()
insight_pipeline = build_insight_pipeline()
