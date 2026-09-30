"""
Node 4 — Personalisation Agent
Injects target-specific variables into the approved email template.
Uses Personalisation / Variable Injection prompting.
"""
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
        return ChatOpenAI(model=settings.FALLBACK_MODEL, api_key=settings.OPENAI_API_KEY, temperature=0.3)
    return ChatGroq(model=settings.PRIMARY_MODEL, api_key=settings.GROQ_API_KEY, temperature=0.3)


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(" ", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


async def personalisation_agent_node(state: AgentState) -> AgentState:
    log.info("personalisation_agent.start", campaign_id=state.get("campaign_id"))

    if state.get("error") or state.get("should_escalate"):
        return state

    targets = state.get("targets", [])
    if not targets:
        log.warning("personalisation_agent.no_targets")
        return state

    personalised_emails: dict[str, dict[str, str]] = {}
    subject_template = state.get("email_subject", "")
    body_template = state.get("email_body", "")

    for target in targets:
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
            company=state.get("organization_name", "the company"),
        )

        messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]

        # Personalise subject too — simple string replacement
        personalised_subject = (
            subject_template
            .replace("{first_name}", first_name)
            .replace("{department}", target.get("department", ""))
            .replace("{company}", state.get("organization_name", ""))
        )

        for use_fallback in (False, True):
            try:
                llm = _get_llm(fallback=use_fallback)
                response = await llm.ainvoke(messages)
                personalised_emails[target_id] = {
                    "subject": personalised_subject,
                    "body": response.content.strip(),
                }
                break
            except Exception as e:
                log.warning("personalisation_agent.llm_error", target_id=target_id, error=str(e))
                if use_fallback:
                    # Fallback: naive replacement without LLM
                    personalised_emails[target_id] = {
                        "subject": personalised_subject,
                        "body": body_template
                            .replace("{first_name}", first_name)
                            .replace("{last_name}", last_name)
                            .replace("{full_name}", full_name)
                            .replace("{department}", target.get("department", "your department"))
                            .replace("{job_title}", target.get("job_title", ""))
                            .replace("{manager_name}", target.get("manager_name", "your manager")),
                    }

    log.info("personalisation_agent.done", count=len(personalised_emails))
    return {**state, "personalised_emails": personalised_emails, "error": None}
