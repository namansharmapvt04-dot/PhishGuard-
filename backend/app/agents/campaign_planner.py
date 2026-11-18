"""
Node 1 — Campaign Planner
Analyses the campaign config and reasons about the best attack strategy.
Uses Role/Persona + Chain-of-Thought prompting.
"""
import asyncio
import structlog

from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.agents.state import AgentState
from app.agents.json_utils import safe_json_loads
from app.rag.vectorstore import retrieve_patterns

log = structlog.get_logger(__name__)

SYSTEM_PROMPT = """You are an expert red-team social engineer and phishing consultant.
Your role is to analyse a phishing campaign brief and produce a precise attack plan.
Think step-by-step before producing your final JSON output.

SENDER NAME — CRITICAL:
- Invent a fresh, realistic Indian corporate full name for "sender_name" on
  every single campaign — vary it every time, never settle into a repeated
  default. Draw on names in the same style as (not limited to, and not
  always exactly) Rohan Kulkarni, Ananya Deshmukh, Vikramaditya Nair, Sneha
  Iyer, Karthik Subramanian, Priya Menon, Arjun Malhotra — mix first and
  last names freely rather than reusing these verbatim every time.
- NEVER use generic placeholder names like "John Doe", "Jane Smith", "John
  Smith", or any other obviously-fake example name.
- "sender_email" must be a plausible corporate address built from that same
  name/role (e.g. first-initial.lastname@domain, or role-based like
  it.support@domain) — matched to the persona's role, not a hardcoded
  address from an example.

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
  "sender_name": "a freshly invented, realistic Indian full name for this campaign's spoofed sender — vary it every time, never a generic placeholder like John Doe",
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
            request_timeout=30,
        )
    return ChatGroq(
        model=settings.PRIMARY_MODEL,
        api_key=settings.GROQ_API_KEY,
        temperature=0.7,
        request_timeout=30,
    )


async def campaign_planner_node(state: AgentState) -> AgentState:
    log.info("campaign_planner.start", campaign_id=state.get("campaign_id"))

    # RAG: retrieve relevant phishing patterns as context
    query = f"{state.get('attack_vector', '')} phishing {state.get('target_department', '')} department"
    try:
        # retrieve_patterns is synchronous (ChromaDB's ONNX embedding
        # inference + query are both CPU-bound, blocking calls) — running it
        # directly here would stall the single event loop for every other
        # in-flight request (listing campaigns, targets, etc.) for as long
        # as it takes. to_thread hands it to a worker thread instead.
        rag_patterns = await asyncio.to_thread(retrieve_patterns, query, settings.RAG_TOP_K)
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

    # Retry the primary model once before falling back — a malformed-JSON
    # response is usually a one-off formatting glitch, not a reason to burn
    # a call on the fallback provider (which commonly has no real API key
    # configured at all, so it's a guaranteed failure, not a real fallback).
    for use_fallback in (False, False, True):
        try:
            llm = _get_llm(fallback=use_fallback)
            # request_timeout on the client is unreliable in this environment
            # (observed hanging indefinitely despite being set) — this is a
            # hard backstop that can't fail the same way.
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=35)
            plan = safe_json_loads(response.content.strip())
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
