"""
Target endpoints: add individual or bulk targets to a campaign.
"""
import uuid
import secrets

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
import structlog

from app.dependencies import CurrentUser, DB
from app.models.campaign import Campaign, CampaignState
from app.models.target import Target
from app.schemas.target import TargetCreate, TargetBulkCreate, TargetOut, TargetActivity
from app.models.tracking import TrackingEvent, EventType

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/campaigns/{campaign_id}/targets", tags=["targets"])


def _campaign_org_filter(campaign_id: uuid.UUID, org_id: uuid.UUID):
    return (Campaign.id == campaign_id) & (Campaign.organization_id == org_id)


async def _verify_campaign(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB) -> Campaign:
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


@router.get("", response_model=list[TargetOut])
async def list_targets(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    await _verify_campaign(campaign_id, current_user, db)
    result = await db.execute(
        select(Target).where(Target.campaign_id == campaign_id).order_by(Target.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=TargetOut, status_code=status.HTTP_201_CREATED)
async def add_target(campaign_id: uuid.UUID, payload: TargetCreate, current_user: CurrentUser, db: DB):
    campaign = await _verify_campaign(campaign_id, current_user, db)
    if campaign.state not in (CampaignState.DRAFT, CampaignState.READY, CampaignState.SCHEDULED):
        raise HTTPException(status_code=400, detail="Cannot add targets to a running or completed campaign")

    target = Target(
        email=payload.email,
        full_name=payload.full_name,
        department=payload.department,
        job_title=payload.job_title,
        manager_name=payload.manager_name,
        tracking_token=secrets.token_urlsafe(32),
        campaign_id=campaign_id,
        organization_id=current_user.organization_id,
    )
    db.add(target)
    await db.flush()
    await db.refresh(target)
    return target


@router.post("/bulk", response_model=list[TargetOut], status_code=status.HTTP_201_CREATED)
async def bulk_add_targets(campaign_id: uuid.UUID, payload: TargetBulkCreate, current_user: CurrentUser, db: DB):
    campaign = await _verify_campaign(campaign_id, current_user, db)
    if campaign.state not in (CampaignState.DRAFT, CampaignState.READY, CampaignState.SCHEDULED):
        raise HTTPException(status_code=400, detail="Cannot add targets to a running or completed campaign")

    created = []
    for t in payload.targets:
        target = Target(
            email=t.email,
            full_name=t.full_name,
            department=t.department,
            job_title=t.job_title,
            manager_name=t.manager_name,
            tracking_token=secrets.token_urlsafe(32),
            campaign_id=campaign_id,
            organization_id=current_user.organization_id,
        )
        db.add(target)
        created.append(target)

    await db.flush()
    for t in created:
        await db.refresh(t)
    log.info("targets.bulk_created", count=len(created), campaign_id=str(campaign_id))
    return created


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_target(campaign_id: uuid.UUID, target_id: uuid.UUID, current_user: CurrentUser, db: DB):
    await _verify_campaign(campaign_id, current_user, db)
    result = await db.execute(
        select(Target).where(Target.id == target_id, Target.campaign_id == campaign_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    await db.delete(target)


@router.get("/activity", response_model=list[TargetActivity])
async def targets_activity(campaign_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """Per-target activity breakdown."""
    await _verify_campaign(campaign_id, current_user, db)

    targets_result = await db.execute(
        select(Target).where(Target.campaign_id == campaign_id)
    )
    targets = targets_result.scalars().all()

    events_result = await db.execute(
        select(TrackingEvent).where(TrackingEvent.campaign_id == campaign_id)
    )
    events = events_result.scalars().all()

    # Build lookup: target_id → set of event types
    event_map: dict[str, set] = {}
    first_event: dict[str, any] = {}
    for ev in events:
        tid = str(ev.target_id)
        if tid not in event_map:
            event_map[tid] = set()
        event_map[tid].add(ev.event_type)
        if tid not in first_event or ev.occurred_at < first_event[tid]:
            first_event[tid] = ev.occurred_at

    return [
        TargetActivity(
            target_id=t.id,
            email=t.email,
            full_name=t.full_name,
            opened=EventType.EMAIL_OPENED in event_map.get(str(t.id), set()),
            clicked=EventType.LINK_CLICKED in event_map.get(str(t.id), set()),
            credentials_submitted=EventType.CREDENTIALS_SUBMITTED in event_map.get(str(t.id), set()),
            reported=EventType.REPORTED_PHISH in event_map.get(str(t.id), set()),
            first_event_at=first_event.get(str(t.id)),
        )
        for t in targets
    ]
