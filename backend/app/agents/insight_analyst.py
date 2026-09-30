"""
Node 5 — Insight Analyst
Post-campaign: analyses click/open/credential data and generates
actionable training recommendations.
"""
import json
import structlog

from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.agents.state import AgentState

log = structlog.get_logger(__name__)

SYSTEM_PROMPT = """You are a cybersecurity training expert analysing phishing simulation results.
Your role is to produce clear, actionable insights that help organisations improve employee security awareness.
Output ONLY valid JSON. No markdown. No explanation."""

ANALYST_TEMPLATE = """
Campaign results:
{results_json}

Analyse these results and produce training recommendations.
Output ONLY:
{{
  "risk_level": "low|medium|high|critical",
  "vulnerability_summary": "2-3 sentence summary of the main security gaps",
  "top_vulnerabilities": ["specific weakness 1", "specific weakness 2", "specific weakness 3"],
  "recommended_training": [
    {{"topic": "topic name", "priority": "high|medium|low", "rationale": "why this matters"}}
  ],
  "departments_at_risk": ["dept1", "dept2"],
  "immediate_actions": ["action 1", "action 2"]
}}
"""


def _get_llm(fallback: bool = False):
    if fallback or not settings.GROQ_API_KEY:
        return ChatOpenAI(model=settings.FALLBACK_MODEL, api_key=settings.OPENAI_API_KEY, temperature=0.4)
    return ChatGroq(model=settings.PRIMARY_MODEL, api_key=settings.GROQ_API_KEY, temperature=0.4)


async def insight_analyst_node(state: AgentState) -> AgentState:
    log.info("insight_analyst.start", campaign_id=state.get("campaign_id"))

    # This node runs post-campaign with tracking stats injected into state
    campaign_results = state.get("campaign_results", {})
    if not campaign_results:
        log.warning("insight_analyst.no_results")
        return state

    prompt = ANALYST_TEMPLATE.format(results_json=json.dumps(campaign_results, indent=2))
    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]

    for use_fallback in (False, True):
        try:
            llm = _get_llm(fallback=use_fallback)
            response = await llm.ainvoke(messages)
            insights = json.loads(response.content.strip())
            log.info("insight_analyst.done", risk_level=insights.get("risk_level"))
            return {**state, "insights": insights, "error": None}
        except Exception as e:
            log.warning("insight_analyst.error", fallback=use_fallback, error=str(e))
            if use_fallback:
                return {**state, "insights": {}, "error": f"Insight Analyst failed: {e}"}
