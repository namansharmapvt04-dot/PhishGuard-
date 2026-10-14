"""
Campaign endpoints: CRUD + trigger generation pipeline + SSE progress stream.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
import structlog

from app.config import settings
from app.database import AsyncSessionLocal
from app.dependencies import CurrentUser, DB, Redis
from app.models.campaign import Campaign, CampaignState
from app.models.target import Target, TargetStatus
from app.models.tracking import TrackingEvent, EventType
from app.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignOut, CampaignStats
from app.agents import generation_pipeline, insight_pipeline, AgentState
from app.core.sse import sse_format, SSEEvent
from app.core.mailer import send_email, inject_tracking, MailerNotConfigured, MailerError

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])


# ── CRUD ────────────────────────────────────────────────────────────────────

@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(payload: CampaignCreate, current_user: CurrentUser, db: DB):
    campaign = Campaign(
        name=payload.name,
        description=payload.description,
        target_department=payload.target_department,
        urgency_level=payload.urgency_level,
        attack_vector=payload.attack_vector,
        scheduled_at=payload.scheduled_at,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id,
    )
    db.add(campaign)
    await db.flush()
    await db.refresh(campaign)
    return campaign


@router.get("", response_model=list[CampaignOut])
async def list_campaigns(current_user: CurrentUser, db: DB, skip: int = 0, limit: int = 20):
    result = await db.execute(
        select(Campaign)
        .where(Campaign.organization_id == current_user.organization_id)
        .order_by(Campaign.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{campaign_id}", response_model=CampaignOut)
async def get_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    return campaign


@router.patch("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(campaign_id: uuid.UUID, payload: CampaignUpdate, current_user: CurrentUser, db: DB):
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    if campaign.state not in (CampaignState.DRAFT, CampaignState.READY, CampaignState.ESCALATED):
        raise HTTPException(status_code=400, detail="Cannot edit a campaign that is running or done")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(campaign, field, value)
    await db.flush()
    await db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    if campaign.state == CampaignState.RUNNING:
        raise HTTPException(status_code=400, detail="Cannot delete a running campaign")
    await db.delete(campaign)


# ── Generation pipeline ─────────────────────────────────────────────────────

@router.post("/{campaign_id}/generate")
async def generate_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """
    Triggers the LangGraph 5-node pipeline. Streams SSE progress events.
    """
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    if campaign.state not in (CampaignState.DRAFT, CampaignState.ESCALATED):
        raise HTTPException(status_code=400, detail=f"Cannot generate in state: {campaign.state}")

    # organization is a lazy relationship — load it before touching it below,
    # same pattern used in auth.me / register (async lazy-load needs an
    # explicit refresh; a bare attribute access raises MissingGreenlet).
    await db.refresh(current_user, ["organization"])

    # Transition to GENERATING immediately
    campaign.state = CampaignState.GENERATING
    await db.flush()

    # Gather targets for personalisation
    targets_result = await db.execute(
        select(Target).where(Target.campaign_id == campaign_id)
    )
    targets = [
        {
            "id": str(t.id),
            "email": t.email,
            "full_name": t.full_name,
            "department": t.department,
            "job_title": t.job_title,
            "manager_name": t.manager_name,
        }
        for t in targets_result.scalars().all()
    ]

    initial_state: AgentState = {
        "campaign_id": str(campaign_id),
        "organization_name": current_user.organization.name if hasattr(current_user, "organization") else "Company",
        "target_department": campaign.target_department or "all departments",
        "attack_vector": campaign.attack_vector or "credential harvesting",
        "urgency_level": campaign.urgency_level or "medium",
        "targets": targets,
        "retry_count": 0,
        "should_escalate": False,
        "error": None,
    }

    async def event_stream():
        yield sse_format(SSEEvent.PIPELINE_STARTED, {"campaign_id": str(campaign_id)})

        # FastAPI closes the `db` session (the Depends(DB) one above) as soon as
        # this endpoint function returns the StreamingResponse object — before
        # this generator body ever runs. Writing through that `db`/`campaign`
        # later silently no-ops (the session is detached, so commit() has
        # nothing pending). Open a dedicated session here instead, scoped to
        # just this generator's lifetime, for every write below.
        async with AsyncSessionLocal() as write_db:
            try:
                async for chunk in generation_pipeline.astream(initial_state):
                    node_name = list(chunk.keys())[0] if chunk else None
                    if node_name:
                        node_state = chunk[node_name]
                        yield sse_format(SSEEvent.NODE_COMPLETED, {
                            "node": node_name,
                            "ragas_score": node_state.get("ragas_score"),
                            "retry_count": node_state.get("retry_count", 0),
                            "eval_passed": node_state.get("eval_passed"),
                        })

                # After pipeline: persist results
                final_state = node_state  # last chunk state
                write_campaign = await write_db.get(Campaign, campaign_id)
                if final_state.get("should_escalate"):
                    write_campaign.state = CampaignState.ESCALATED
                    yield sse_format(SSEEvent.STATE_CHANGED, {"state": "ESCALATED"})
                else:
                    write_campaign.email_subject = final_state.get("email_subject")
                    write_campaign.email_body = final_state.get("email_body")
                    write_campaign.email_from_name = final_state.get("sender_name")
                    write_campaign.email_from_address = final_state.get("sender_email")
                    write_campaign.sender_persona = final_state.get("sender_persona")
                    write_campaign.ragas_score = final_state.get("ragas_score")
                    write_campaign.retry_count = final_state.get("retry_count", 0)
                    write_campaign.agent_metadata = {
                        "plan_reasoning": final_state.get("plan_reasoning"),
                        "fear_factor": final_state.get("fear_factor"),
                        "urgency_trigger": final_state.get("urgency_trigger"),
                        "eval_feedback": final_state.get("eval_feedback"),
                        "rag_pattern_count": len(final_state.get("rag_patterns", [])),
                    }
                    write_campaign.state = CampaignState.READY

                    # Persist each target's personalised content (the
                    # Personalisation Agent already produced it in
                    # final_state, but nothing wrote it to the target
                    # rows — /launch needs it there to actually send).
                    personalised = final_state.get("personalised_emails", {})
                    for target_id, content in personalised.items():
                        try:
                            target_uuid = uuid.UUID(target_id)
                        except ValueError:
                            continue
                        target_row = await write_db.get(Target, target_uuid)
                        if target_row:
                            target_row.personalised_subject = content.get("subject")
                            target_row.personalised_body = content.get("body")

                    yield sse_format(SSEEvent.STATE_CHANGED, {"state": "READY"})
                    yield sse_format(SSEEvent.PIPELINE_COMPLETED, {
                        "ragas_score": write_campaign.ragas_score,
                        "subject": write_campaign.email_subject,
                    })

                await write_db.commit()

            except Exception as e:
                log.error("generate.stream_error", error=str(e))
                await write_db.rollback()
                write_campaign = await write_db.get(Campaign, campaign_id)
                write_campaign.state = CampaignState.ESCALATED
                await write_db.commit()
                yield sse_format(SSEEvent.PIPELINE_FAILED, {"error": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Launch (actually send the emails) ────────────────────────────────────────

async def _reserve_quota(redis: Redis, count: int) -> int:
    """
    Atomically reserves up to `count` sends against today's Brevo free-tier
    daily cap, tracked in Redis (keyed by UTC date, auto-expires next day).
    Returns how many were actually reserved (may be less than `count`, or 0).
    """
    key = f"email_quota:{datetime.now(timezone.utc).date().isoformat()}"
    used = await redis.incrby(key, count)
    await redis.expire(key, 90000)  # ~25h, so it always outlives "today"
    if used > settings.BREVO_DAILY_LIMIT:
        over = used - settings.BREVO_DAILY_LIMIT
        reserved = count - over
        await redis.decrby(key, over)  # give back what we couldn't use
        return max(0, reserved)
    return count


@router.post("/{campaign_id}/launch")
async def launch_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB, redis: Redis):
    """
    Sends the generated, personalised email to every PENDING target via
    Brevo, throttled to the free-tier daily cap. Safe to call again later
    (e.g. the next day) to keep working through a target list bigger than
    one day's quota — already-SENT targets are skipped.
    """
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    if campaign.state not in (CampaignState.READY, CampaignState.SCHEDULED, CampaignState.RUNNING):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot launch from state: {campaign.state}. Generate the email first.",
        )
    if not campaign.email_subject or not campaign.email_body:
        raise HTTPException(status_code=400, detail="No generated email to send — run Generate first")

    pending_result = await db.execute(
        select(Target).where(Target.campaign_id == campaign_id, Target.status == TargetStatus.PENDING)
    )
    pending = pending_result.scalars().all()
    if not pending:
        return {"sent": 0, "failed": 0, "remaining_pending": 0, "message": "No pending targets to send to."}

    reserved = await _reserve_quota(redis, len(pending))
    to_send, to_defer = pending[:reserved], pending[reserved:]

    sent = failed = 0
    for target in to_send:
        subject = target.personalised_subject or campaign.email_subject
        body = target.personalised_body or campaign.email_body
        tracked_body = inject_tracking(body, settings.BASE_URL, target.tracking_token)
        try:
            await send_email(
                to_email=target.email,
                to_name=target.full_name,
                subject=subject,
                html_body=tracked_body,
                sender_name=campaign.email_from_name,
            )
            target.status = TargetStatus.SENT
            target.sent_at = datetime.now(timezone.utc)
            sent += 1
        except (MailerNotConfigured, MailerError) as e:
            target.status = TargetStatus.FAILED
            target.failed_reason = str(e)[:500]
            failed += 1

    if campaign.state != CampaignState.RUNNING:
        campaign.state = CampaignState.RUNNING
        campaign.started_at = campaign.started_at or datetime.now(timezone.utc)

    await db.flush()

    message = None
    if to_defer:
        message = (
            f"Hit today's sending limit — {len(to_defer)} target(s) still PENDING. "
            "Call launch again tomorrow (or once quota resets) to continue."
        )
    return {
        "sent": sent,
        "failed": failed,
        "remaining_pending": len(to_defer),
        "message": message,
    }


# ── Campaign control ─────────────────────────────────────────────────────────

@router.post("/{campaign_id}/pause", response_model=CampaignOut)
async def pause_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    if campaign.state != CampaignState.RUNNING:
        raise HTTPException(status_code=400, detail="Only RUNNING campaigns can be paused")
    campaign.state = CampaignState.PAUSED
    await db.flush()
    await db.refresh(campaign)
    return campaign


@router.post("/{campaign_id}/resume", response_model=CampaignOut)
async def resume_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    if campaign.state != CampaignState.PAUSED:
        raise HTTPException(status_code=400, detail="Only PAUSED campaigns can be resumed")
    campaign.state = CampaignState.RUNNING
    await db.flush()
    await db.refresh(campaign)
    return campaign


# ── Stats ─────────────────────────────────────────────────────────────────

async def _compute_stats(campaign_id: uuid.UUID, db: DB) -> CampaignStats:
    from app.models.target import Target, TargetStatus
    total_q = await db.execute(
        select(func.count()).where(Target.campaign_id == campaign_id)
    )
    total = total_q.scalar_one()

    sent_q = await db.execute(
        select(func.count()).where(Target.campaign_id == campaign_id, Target.status == TargetStatus.SENT)
    )
    sent = sent_q.scalar_one()

    async def _count(etype: EventType) -> int:
        q = await db.execute(
            select(func.count(TrackingEvent.target_id.distinct()))
            .where(TrackingEvent.campaign_id == campaign_id, TrackingEvent.event_type == etype)
        )
        return q.scalar_one()

    opened = await _count(EventType.EMAIL_OPENED)
    clicked = await _count(EventType.LINK_CLICKED)
    submitted = await _count(EventType.CREDENTIALS_SUBMITTED)
    reported = await _count(EventType.REPORTED_PHISH)

    return CampaignStats(
        campaign_id=campaign_id,
        total_targets=total,
        emails_sent=sent,
        opened=opened,
        clicked=clicked,
        credentials_submitted=submitted,
        reported=reported,
        open_rate=round(opened / sent, 4) if sent else 0.0,
        click_rate=round(clicked / sent, 4) if sent else 0.0,
        compromise_rate=round(submitted / sent, 4) if sent else 0.0,
    )


@router.get("/{campaign_id}/stats", response_model=CampaignStats)
async def campaign_stats(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    await _get_campaign_or_404(campaign_id, current_user, db)
    return await _compute_stats(campaign_id, db)


# ── Insight analyst ──────────────────────────────────────────────────────────

@router.post("/{campaign_id}/analyse", response_model=CampaignOut)
async def analyse_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """
    Runs the insight-analyst agent over this campaign's tracking results and
    persists risk_level/vulnerability_summary/top_vulnerabilities/
    recommended_training/departments_at_risk/immediate_actions into
    agent_metadata.
    """
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)
    if campaign.state != CampaignState.DONE:
        raise HTTPException(status_code=400, detail="Campaign must be DONE before it can be analysed")

    stats = await _compute_stats(campaign_id, db)
    campaign_results = {
        "campaign_name": campaign.name,
        "attack_vector": campaign.attack_vector,
        "target_department": campaign.target_department,
        "urgency_level": campaign.urgency_level,
        "total_targets": stats.total_targets,
        "emails_sent": stats.emails_sent,
        "opened": stats.opened,
        "clicked": stats.clicked,
        "credentials_submitted": stats.credentials_submitted,
        "reported": stats.reported,
        "open_rate": stats.open_rate,
        "click_rate": stats.click_rate,
        "compromise_rate": stats.compromise_rate,
    }

    result: AgentState = await insight_pipeline.ainvoke({
        "campaign_id": str(campaign_id),
        "campaign_results": campaign_results,
    })

    insights = result.get("insights") or {}
    if not insights:
        raise HTTPException(status_code=502, detail=result.get("error") or "Insight analyst returned no result")

    campaign.agent_metadata = {**(campaign.agent_metadata or {}), **insights}
    await db.flush()
    await db.refresh(campaign)
    return campaign


# ── Helper ────────────────────────────────────────────────────────────────

async def _get_campaign_or_404(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB) -> Campaign:
    result = await db.execute(
        select(Campaign).where(
            Campaign.id == campaign_id,
            Campaign.organization_id == current_user.organization_id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign
