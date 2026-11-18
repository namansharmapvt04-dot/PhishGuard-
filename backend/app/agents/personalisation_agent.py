"""
Node 4 — Personalisation Agent
Injects target-specific variables into the approved email template.
Uses Personalisation / Variable Injection prompting.
"""
import asyncio
import structlog

from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.agents.state import AgentState

log = structlog.get_logger(__name__)

SYSTEM_PROMPT = """You are personalising phishing simulation emails for security awareness training.
Replace all template variables with the actual target's information.
Make the email feel 100% written specifically for this individual.
Return ONLY the personalised body text. No JSON wrapper. No explanation."""

PERSONALISE_TEMPLATE = """
Template subject: {subject}
Template body:
{body}

Target information:
- First name: {first_name}
- Last name: {last_name}
- Full name: {full_name}
- Department: {department}
- Job title: {job_title}
- Manager name: {manager_name}
- Company: {company}

Replace ALL template variables ({{first_name}}, {{department}}, etc.) with the target's real information.
Also naturally weave in their job title and manager's name where it adds authenticity.
Return ONLY the final personalised email body.
"""


def _get_llm(fallback: bool = False):
    if fallback or not settings.GROQ_API_KEY:
        return ChatOpenAI(model=settings.FALLBACK_MODEL, api_key=settings.OPENAI_API_KEY, temperature=0.3, request_timeout=30)
    return ChatGroq(model=settings.PRIMARY_MODEL, api_key=settings.GROQ_API_KEY, temperature=0.3, request_timeout=30)


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(" ", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


# Caps how many targets get personalised concurrently — was a plain
# sequential for-loop (one LLM call, then the next, then the next), which
# made total time scale linearly with target count. Running them concurrently
# is the single biggest lever on wall-clock time for any campaign with more
# than 1-2 targets; capped so a large campaign doesn't fire 100 simultaneous
# requests at Groq's rate limit.
_PERSONALISE_CONCURRENCY = 5


async def _personalise_one(
    target: dict,
    subject_template: str,
    body_template: str,
    organization_name: str,
    semaphore: asyncio.Semaphore,
) -> tuple[str, dict[str, str]]:
    target_id = str(target.get("id", target.get("email")))
    full_name = target.get("full_name", "Employee")
    first_name, last_name = _split_name(full_name)

    prompt = PERSONALISE_TEMPLATE.format(
        subject=subject_template,
        body=body_template,
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
        department=target.get("department", "your department"),
        job_title=target.get("job_title", "team member"),
        manager_name=target.get("manager_name", "your manager"),
        company=organization_name,
    )
    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]

    # Personalise subject too — simple string replacement
    personalised_subject = (
        subject_template
        .replace("{first_name}", first_name)
        .replace("{department}", target.get("department", ""))
        .replace("{company}", organization_name)
    )

    async with semaphore:
        for use_fallback in (False, True):
            try:
                llm = _get_llm(fallback=use_fallback)
                response = await asyncio.wait_for(llm.ainvoke(messages), timeout=35)
                return target_id, {
                    "subject": personalised_subject,
                    "body": response.content.strip(),
                }
            except Exception as e:
                log.warning("personalisation_agent.llm_error", target_id=target_id, error=str(e))
                if use_fallback:
                    # Fallback: naive replacement without LLM
                    return target_id, {
                        "subject": personalised_subject,
                        "body": body_template
                            .replace("{first_name}", first_name)
                            .replace("{last_name}", last_name)
                            .replace("{full_name}", full_name)
                            .replace("{department}", target.get("department", "your department"))
                            .replace("{job_title}", target.get("job_title", ""))
                            .replace("{manager_name}", target.get("manager_name", "your manager")),
                    }


async def personalisation_agent_node(state: AgentState) -> AgentState:
    log.info("personalisation_agent.start", campaign_id=state.get("campaign_id"))

    if state.get("error") or state.get("should_escalate"):
        return state

    targets = state.get("targets", [])
    if not targets:
        log.warning("personalisation_agent.no_targets")
        return state

    subject_template = state.get("email_subject", "")
    body_template = state.get("email_body", "")
    organization_name = state.get("organization_name", "the company")
    semaphore = asyncio.Semaphore(_PERSONALISE_CONCURRENCY)

    results = await asyncio.gather(*[
        _personalise_one(target, subject_template, body_template, organization_name, semaphore)
        for target in targets
    ])
    personalised_emails = dict(results)

    log.info("personalisation_agent.done", count=len(personalised_emails))
    return {**state, "personalised_emails": personalised_emails, "error": None}
