"""
Public tracking endpoints — called by the tracking pixel and landing page.
No auth required; authenticated only by the per-target tracking_token.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select
import structlog

from app.database import get_db
from app.models.target import Target, TargetStatus
from app.models.tracking import TrackingEvent, EventType
from app.config import settings

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/track", tags=["tracking"])

# 1×1 transparent GIF for pixel tracking
PIXEL_GIF = bytes([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,  # GIF89a
    0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00,
    0x21, 0xF9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0x02, 0x02, 0x44, 0x01, 0x00, 0x3B,
])


async def _record_event(
    token: str,
    event_type: EventType,
    request: Request,
) -> Target | None:
    """Record a tracking event; returns the target or None if token invalid."""
    async for db in get_db():
        result = await db.execute(select(Target).where(Target.tracking_token == token))
        target = result.scalar_one_or_none()
        if not target:
            return None

        event = TrackingEvent(
            event_type=event_type,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            campaign_id=target.campaign_id,
            target_id=target.id,
        )
        db.add(event)
        await db.commit()
        log.info("tracking.event", event_type=event_type, target_id=str(target.id))
        return target


@router.get("/open/{token}")
async def track_open(token: str, request: Request):
    """Tracking pixel — records email open event."""
    await _record_event(token, EventType.EMAIL_OPENED, request)
    return Response(
        content=PIXEL_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.get("/click/{token}")
async def track_click(token: str, request: Request):
    """Records link click and redirects to phishing landing page."""
    await _record_event(token, EventType.LINK_CLICKED, request)
    # Redirect to simulated phishing page
    landing_url = f"{settings.BASE_URL}/phish/{token}"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=landing_url, status_code=302)


@router.post("/submit/{token}")
async def track_submission(token: str, request: Request):
    """Records credential submission from the fake login page."""
    await _record_event(token, EventType.CREDENTIALS_SUBMITTED, request)
    # DO NOT store actual credentials — just the event
    return {"message": "Recorded"}


@router.post("/report/{token}")
async def track_report(token: str, request: Request):
    """Records when a target reports the email as phishing (good behaviour!)."""
    await _record_event(token, EventType.REPORTED_PHISH, request)
    return {"message": "Thank you for reporting this email. This was a security awareness simulation."}
