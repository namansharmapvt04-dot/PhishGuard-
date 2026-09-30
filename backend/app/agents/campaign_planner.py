"""
Node 1 — Campaign Planner
Analyses the campaign config and reasons about the best attack strategy.
Uses Role/Persona + Chain-of-Thought prompting.
"""
import json
import structlog

from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.agents.state import AgentState
from app.rag.vectorstore import retrieve_patterns

log = structlog.get_logger(__name__)

SYSTEM_PROMPT = """You are an expert red-team social engineer and phishing consultant.
Your role is to analyse a phishing campaign brief and produce a precise attack plan.
Think step-by-step before producing your final JSON output.
Your output must be ONLY valid JSON — no markdown, no explanation outside the JSON."""

PLANNER_TEMPLATE = """
Campaign brief:
- Organisation: {organization_name}
- Target department: {target_department}
- Attack vector: {attack_vector}
- Urgency level: {urgency_level}

Step-by-step reasoning:
1. Who is the most credible authority figure this department trusts?
2. What is their biggest day-to-day fear or compliance pressure?
3. What one action would they take without thinking twice?

Output ONLY this JSON:
{{
  "sender_persona": "brief description of who the sender pretends to be",
  "sender_name": "Full Name of the spoofed sender",
  "sender_email": "realistic@{domain}",
  "urgency_trigger": "the specific event that makes this urgent",
  "fear_factor": "the emotion/fear being exploited",
  "plan_reasoning": "2-3 sentence explanation of the strategy"
}}
"""


def _get_llm(fallback: bool = False):
    if fallback or not settings.GROQ_API_KEY:
        return ChatOpenAI(
            model=settings.FALLBACK_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=0.7,
        )
    return ChatGroq(
        model=settings.PRIMARY_MODEL,
        api_key=settings.GROQ_API_KEY,
        temperature=0.7,
    )


async def campaign_planner_node(state: AgentState) -> AgentState:
    log.info("campaign_planner.start", campaign_id=state.get("campaign_id"))

    # RAG: retrieve relevant phishing patterns as context
    query = f"{state.get('attack_vector', '')} phishing {state.get('target_department', '')} department"
    try:
        rag_patterns = retrieve_patterns(query, k=settings.RAG_TOP_K)
    except Exception as e:
        log.warning("campaign_planner.rag_failed", error=str(e))
        rag_patterns = []

    domain = state.get("organization_name", "company").lower().replace(" ", "") + ".com"
    prompt = PLANNER_TEMPLATE.format(
        organization_name=state.get("organization_name", "the target company"),
        target_department=state.get("target_department", "employees"),
        attack_vector=state.get("attack_vector", "credential harvesting"),
        urgency_level=state.get("urgency_level", "medium"),
        domain=domain,
    )

    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]

    for use_fallback in (False, True):
        try:
            llm = _get_llm(fallback=use_fallback)
            response = await llm.ainvoke(messages)
            plan = json.loads(response.content.strip())
            log.info("campaign_planner.done", plan=plan)
            return {
                **state,
                "rag_patterns": rag_patterns,
                "sender_persona": plan["sender_persona"],
                "sender_name": plan["sender_name"],
                "sender_email": plan["sender_email"],
                "urgency_trigger": plan["urgency_trigger"],
                "fear_factor": plan["fear_factor"],
                "plan_reasoning": plan["plan_reasoning"],
                "error": None,
            }
        except Exception as e:
            log.warning("campaign_planner.llm_error", fallback=use_fallback, error=str(e))
            if use_fallback:
                return {**state, "error": f"Campaign Planner failed: {e}", "should_escalate": True}
