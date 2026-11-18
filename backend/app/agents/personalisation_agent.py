"""
Node 4 — Personalisation Agent
Injects target-specific variables into the approved email template.
Uses Personalisation / Variable Injection prompting.
"""
import asyncio
import re
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
Do not introduce your own bracketed placeholders like "[Manager Name]" or
"[Insert Name]" — use the real values given to you, written as natural prose.
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


_BRACKET_RE = re.compile(r"\[([^\[\]]{1,80})\]")


def _strip_bracket_placeholders(text: str, ctx: dict[str, str]) -> str:
    """
    Catches bracketed placeholder text an LLM invents on its own (e.g.
    "[Manager Name]", "[your manager's name]", "[Insert Name]") that the
    prompt's curly-brace {manager_name}-style tokens didn't stop it from
    writing — smaller/less-compliant models do this fairly often regardless
    of instructions. Matched by keyword in the bracket content rather than
    exact phrasing, since the model's wording varies; anything unrecognised
    is dropped outright rather than left as an obviously-fake "[...]" marker
    in a sent email.
    """
    def _resolve(m: re.Match) -> str:
        phrase = m.group(1).lower()
        if "manager" in phrase or "supervisor" in phrase or "boss" in phrase:
            return ctx["manager_name"]
        if "last name" in phrase or "surname" in phrase:
            return ctx["last_name"]
        if "full name" in phrase:
            return ctx["full_name"]
        if "first name" in phrase or "your name" in phrase:
            return ctx["first_name"]
        if "department" in phrase or "team" in phrase:
            return ctx["department"]
        if "job title" in phrase or "role" in phrase or "position" in phrase:
            return ctx["job_title"]
        if "company" in phrase or "organi" in phrase:  # organisation/organization
            return ctx["company"]
        return ""

    return _BRACKET_RE.sub(_resolve, text)


def _safe(value: str | None, default: str = "") -> str:
    """
    Coerce a possibly-None/empty target field to a plain string.

    `dict.get(key, default)` only falls back when the key is *missing* —
    department/job_title/manager_name are nullable Postgres columns, so the
    dict built from a Target row always has the key present, just with a
    None value. str.replace()'s second argument must be a str, so passing
    that None straight through crashes with
    "TypeError: replace() argument 2 must be str, not None" the moment any
    target has a blank optional field.
    """
    if value is None:
        return default
    value = str(value).strip()
    return value or default


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
    full_name = _safe(target.get("full_name"), "Employee")
    first_name, last_name = _split_name(full_name)
    department = _safe(target.get("department"), "your department")
    job_title = _safe(target.get("job_title"), "team member")
    manager_name = _safe(target.get("manager_name"), "your manager")
    organization_name = _safe(organization_name, "the company")

    prompt = PERSONALISE_TEMPLATE.format(
        subject=subject_template,
        body=body_template,
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
        department=department,
        job_title=job_title,
        manager_name=manager_name,
        company=organization_name,
    )
    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]

    ctx = {
        "first_name": first_name,
        "last_name": last_name,
        "full_name": full_name,
        "department": department,
        "job_title": job_title,
        "manager_name": manager_name,
        "company": organization_name,
    }

    # Personalise subject too — simple string replacement. Must cover every
    # variable the template generator can emit, not just a subset — a
    # template using {last_name} or {manager_name} in the subject (common
    # for "before {last_name}" / "per {manager_name}'s request" phrasing)
    # otherwise ships with the literal placeholder still in it. Also catches
    # any bracketed placeholder the LLM invented on its own, e.g. a subject
    # like "Action required from [Manager Name]".
    personalised_subject = _strip_bracket_placeholders(
        subject_template
        .replace("{first_name}", first_name)
        .replace("{last_name}", last_name)
        .replace("{full_name}", full_name)
        .replace("{department}", department)
        .replace("{job_title}", job_title)
        .replace("{manager_name}", manager_name)
        .replace("{company}", organization_name),
        ctx,
    )

    async with semaphore:
        for use_fallback in (False, True):
            try:
                llm = _get_llm(fallback=use_fallback)
                response = await asyncio.wait_for(llm.ainvoke(messages), timeout=35)
                return target_id, {
                    "subject": personalised_subject,
                    "body": _strip_bracket_placeholders(response.content.strip(), ctx),
                }
            except Exception as e:
                log.warning("personalisation_agent.llm_error", target_id=target_id, error=str(e))
                if use_fallback:
                    # Fallback: naive replacement without LLM
                    return target_id, {
                        "subject": personalised_subject,
                        "body": _strip_bracket_placeholders(
                            body_template
                            .replace("{first_name}", first_name)
                            .replace("{last_name}", last_name)
                            .replace("{full_name}", full_name)
                            .replace("{department}", department)
                            .replace("{job_title}", job_title)
                            .replace("{manager_name}", manager_name),
                            ctx,
                        ),
                    }


async def personalisation_agent_node(state: AgentState) -> AgentState:
    log.info("personalisation_agent.start", campaign_id=state.get("campaign_id"))

    if state.get("error") or state.get("should_escalate"):
        return state

    targets = state.get("targets", [])
    if not targets:
        log.warning("personalisation_agent.no_targets")
        return state

    subject_template = _safe(state.get("email_subject"))
    body_template = _safe(state.get("email_body"))
    organization_name = _safe(state.get("organization_name"), "the company")
    semaphore = asyncio.Semaphore(_PERSONALISE_CONCURRENCY)

    results = await asyncio.gather(*[
        _personalise_one(target, subject_template, body_template, organization_name, semaphore)
        for target in targets
    ])
    personalised_emails = dict(results)

    log.info("personalisation_agent.done", count=len(personalised_emails))
    return {**state, "personalised_emails": personalised_emails, "error": None}
