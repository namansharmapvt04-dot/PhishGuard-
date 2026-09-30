"""
Campaign endpoints: CRUD + trigger generation pipeline + SSE progress stream.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
import structlog

from app.dependencies import CurrentUser, DB
from app.models.campaign import Campaign, CampaignState
from app.models.tracking import TrackingEvent, EventType
from app.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignOut, CampaignStats
from app.agents import generation_pipeline, AgentState
from app.core.sse import sse_format, SSEEvent

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

    # Transition to GENERATING immediately
    campaign.state = CampaignState.GENERATING
    await db.flush()

    # Gather targets for personalisation
    from app.models.target import Target
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
            if final_state.get("should_escalate"):
                campaign.state = CampaignState.ESCALATED
                yield sse_format(SSEEvent.STATE_CHANGED, {"state": "ESCALATED"})
            else:
                campaign.email_subject = final_state.get("email_subject")
                campaign.email_body = final_state.get("email_body")
                campaign.email_from_name = final_state.get("sender_name")
                campaign.email_from_address = final_state.get("sender_email")
                campaign.sender_persona = final_state.get("sender_persona")
                campaign.ragas_score = final_state.get("ragas_score")
                campaign.retry_count = final_state.get("retry_count", 0)
                campaign.agent_metadata = {
                    "plan_reasoning": final_state.get("plan_reasoning"),
                    "fear_factor": final_state.get("fear_factor"),
                    "urgency_trigger": final_state.get("urgency_trigger"),
                    "eval_feedback": final_state.get("eval_feedback"),
                    "rag_pattern_count": len(final_state.get("rag_patterns", [])),
                }
                campaign.state = CampaignState.READY
                yield sse_format(SSEEvent.STATE_CHANGED, {"state": "READY"})
                yield sse_format(SSEEvent.PIPELINE_COMPLETED, {
                    "ragas_score": campaign.ragas_score,
                    "subject": campaign.email_subject,
                })

            await db.commit()

        except Exception as e:
            log.error("generate.stream_error", error=str(e))
            campaign.state = CampaignState.ESCALATED
            await db.commit()
            yield sse_format(SSEEvent.PIPELINE_FAILED, {"error": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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

@router.get("/{campaign_id}/stats", response_model=CampaignStats)
async def campaign_stats(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    campaign = await _get_campaign_or_404(campaign_id, current_user, db)

    from app.models.target import Target, TargetStatus
    total_q = await db.execute(
        select(func.count()).where(Target.campaign_id == campaign_id)
    )
    total = total_q.scalar_one()

    sent_q = await db.execute(
        select(func.count()).where(Target.campaign_id == campaign_id, Target.status == TargetStatus.SENT)
    )
    sent = sent_q.scalar_one()

    def count_event(event_type: EventType) -> int:
        return 0  # populated via subquery in production; simplified here

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
