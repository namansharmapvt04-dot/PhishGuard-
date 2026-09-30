"""
Node 2 — Template Generator
Generates the phishing email template using RAG few-shot patterns.
Uses RAG + Few-Shot + Structured Output prompting.
"""
import json
import structlog

from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.agents.state import AgentState

log = structlog.get_logger(__name__)

SYSTEM_PROMPT = """You are a specialist in crafting highly convincing corporate phishing emails
for authorised security awareness training. Every email you write must be:
- Indistinguishable from a real internal corporate communication
- Professional, concise, and authoritative in tone
- Personalised with template variables like {first_name}, {department}, {company}
Output ONLY valid JSON. No markdown. No explanation."""

GENERATOR_TEMPLATE = """
ATTACK PLAN:
- Sender persona: {sender_persona}
- Sender name: {sender_name}
- Sender email: {sender_email}
- Urgency trigger: {urgency_trigger}
- Fear factor: {fear_factor}
- Target department: {target_department}

REAL PHISHING EXAMPLES (few-shot context from our database):
{rag_examples}

Using the attack plan and the examples above as style guides, write a phishing email.
Use these template variables where appropriate: {{first_name}}, {{last_name}}, {{department}}, {{company}}, {{manager_name}}

Output ONLY this JSON:
{{
  "subject": "email subject line",
  "body": "full HTML-safe email body with template variables"
}}
"""


def _format_rag_examples(patterns: list[dict]) -> str:
    if not patterns:
        return "No examples available."
    lines = []
    for i, p in enumerate(patterns[:5], 1):
        lines.append(f"Example {i}:\n{p['document']}\n")
    return "\n".join(lines)


def _get_llm(fallback: bool = False):
    if fallback or not settings.GROQ_API_KEY:
        return ChatOpenAI(model=settings.FALLBACK_MODEL, api_key=settings.OPENAI_API_KEY, temperature=0.8)
    return ChatGroq(model=settings.PRIMARY_MODEL, api_key=settings.GROQ_API_KEY, temperature=0.8)


async def template_generator_node(state: AgentState) -> AgentState:
    log.info("template_generator.start", campaign_id=state.get("campaign_id"))

    if state.get("error") or state.get("should_escalate"):
        return state

    rag_examples = _format_rag_examples(state.get("rag_patterns", []))
    prompt = GENERATOR_TEMPLATE.format(
        sender_persona=state.get("sender_persona", "IT Security Team"),
        sender_name=state.get("sender_name", "IT Security"),
        sender_email=state.get("sender_email", "it-security@company.com"),
        urgency_trigger=state.get("urgency_trigger", "account verification required"),
        fear_factor=state.get("fear_factor", "account suspension"),
        target_department=state.get("target_department", "all employees"),
        rag_examples=rag_examples,
    )

    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]

    for use_fallback in (False, True):
        try:
            llm = _get_llm(fallback=use_fallback)
            response = await llm.ainvoke(messages)
            result = json.loads(response.content.strip())
            log.info("template_generator.done", subject=result.get("subject"))
            return {
                **state,
                "email_subject": result["subject"],
                "email_body": result["body"],
                "error": None,
            }
        except Exception as e:
            log.warning("template_generator.llm_error", fallback=use_fallback, error=str(e))
            if use_fallback:
                return {**state, "error": f"Template Generator failed: {e}", "should_escalate": True}
