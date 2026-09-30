"""
Node 3 — Realism Evaluator
Scores the generated email on 5 realism dimensions using RAGAS-style evaluation.
Uses Self-Refinement prompting (feeds failure reason back on retry).
"""
import json
import structlog

from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.agents.state import AgentState

log = structlog.get_logger(__name__)

EVALUATOR_SYSTEM = """You are a red-team security expert evaluating phishing email realism.
Score the email on 5 dimensions from 0.0 to 1.0 each. Be strict.
Output ONLY valid JSON."""

EVAL_TEMPLATE = """
Email to evaluate:
Subject: {subject}
Body: {body}

Score each dimension 0.0–1.0:
1. authority_cue     — Does it convincingly impersonate a credible authority?
2. urgency_realism   — Is the urgency believable, not overdone?
3. language_quality  — Is it free of spelling errors, sounds corporate?
4. personalisation   — Does it use plausible personal/contextual details?
5. call_to_action    — Is the CTA subtle and believable?

{retry_feedback}

Output ONLY:
{{
  "authority_cue": 0.0,
  "urgency_realism": 0.0,
  "language_quality": 0.0,
  "personalisation": 0.0,
  "call_to_action": 0.0,
  "overall_score": 0.0,
  "feedback": "one sentence on the main weakness"
}}
"""


def _get_llm(fallback: bool = False):
    if fallback or not settings.GROQ_API_KEY:
        return ChatOpenAI(model=settings.FALLBACK_MODEL, api_key=settings.OPENAI_API_KEY, temperature=0.2)
    return ChatGroq(model=settings.PRIMARY_MODEL, api_key=settings.GROQ_API_KEY, temperature=0.2)


async def realism_evaluator_node(state: AgentState) -> AgentState:
    log.info("realism_evaluator.start", campaign_id=state.get("campaign_id"), retry=state.get("retry_count", 0))

    if state.get("error") or state.get("should_escalate"):
        return state

    retry_count = state.get("retry_count", 0)
    prev_feedback = state.get("eval_feedback", "")
    retry_feedback = ""
    if retry_count > 0 and prev_feedback:
        retry_feedback = (
            f"PREVIOUS ATTEMPT FAILED (score {state.get('ragas_score', 0):.2f}/1.00). "
            f"Failure reason: '{prev_feedback}'. "
            f"The regenerated email must specifically address this weakness."
        )

    prompt = EVAL_TEMPLATE.format(
        subject=state.get("email_subject", ""),
        body=state.get("email_body", ""),
        retry_feedback=retry_feedback,
    )
    messages = [SystemMessage(content=EVALUATOR_SYSTEM), HumanMessage(content=prompt)]

    for use_fallback in (False, True):
        try:
            llm = _get_llm(fallback=use_fallback)
            response = await llm.ainvoke(messages)
            scores = json.loads(response.content.strip())

            overall = scores.get("overall_score") or (
                sum([
                    scores.get("authority_cue", 0),
                    scores.get("urgency_realism", 0),
                    scores.get("language_quality", 0),
                    scores.get("personalisation", 0),
                    scores.get("call_to_action", 0),
                ]) / 5
            )
            eval_passed = overall >= settings.RAGAS_PASS_THRESHOLD

            log.info(
                "realism_evaluator.scored",
                score=overall,
                passed=eval_passed,
                retry=retry_count,
            )
            return {
                **state,
                "ragas_score": round(overall, 4),
                "eval_passed": eval_passed,
                "eval_feedback": scores.get("feedback", ""),
                "error": None,
            }
        except Exception as e:
            log.warning("realism_evaluator.error", fallback=use_fallback, error=str(e))
            if use_fallback:
                return {**state, "error": f"Realism Evaluator failed: {e}", "should_escalate": True}


def should_retry_or_continue(state: AgentState) -> str:
    """LangGraph conditional edge: decide next node after evaluation."""
    if state.get("should_escalate") or state.get("error"):
        return "escalate"
    if state.get("eval_passed"):
        return "personalise"
    retry_count = state.get("retry_count", 0) + 1
    if retry_count >= settings.MAX_RETRIES:
        return "escalate"
    return "retry"
