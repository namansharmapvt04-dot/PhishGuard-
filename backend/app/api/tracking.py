"""
Public tracking endpoints — called by the tracking pixel and landing page.
No auth required; authenticated only by the per-target tracking_token.
"""
import hashlib

from fastapi import APIRouter, Request, Response
from sqlalchemy import select
import structlog

from app.database import get_db
from app.dependencies import get_redis
from app.core.cache import cache_invalidate
from app.models.target import Target
from app.models.tracking import TrackingEvent, EventType
from app.config import settings

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/track", tags=["tracking"])


def _hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()

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
            ip_hash=_hash_ip(request.client.host if request.client else None),
            user_agent=request.headers.get("user-agent"),
            campaign_id=target.campaign_id,
            target_id=target.id,
        )
        db.add(event)
        await db.commit()
        log.info("tracking.event", event_type=event_type, target_id=str(target.id))
        # Every event here changes the campaign's open/click/submit/report
        # counts — drop the cached stats so the dashboard doesn't sit on a
        # pre-event snapshot for the rest of its TTL.
        redis = await get_redis()
        await cache_invalidate(redis, "stats", target.campaign_id)
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
    """Records link click and redirects to the simulation landing page."""
    # A click proves the email was seen even if the open pixel never fired
    # (many clients block remote images by default but still let the user
    # click a link) — without this, "opened" under-counts real engagement.
    target = await _record_event(token, EventType.LINK_CLICKED, request)
    if target:
        async for db in get_db():
            already_opened = await db.execute(
                select(TrackingEvent).where(
                    TrackingEvent.target_id == target.id,
                    TrackingEvent.event_type == EventType.EMAIL_OPENED,
                )
            )
            if already_opened.scalar_one_or_none() is None:
                db.add(TrackingEvent(
                    event_type=EventType.EMAIL_OPENED,
                    ip_hash=_hash_ip(request.client.host if request.client else None),
                    user_agent=request.headers.get("user-agent"),
                    campaign_id=target.campaign_id,
                    target_id=target.id,
                ))
                await db.commit()
            break
    # The landing/debrief page is a real frontend route (SimLanding.tsx, not
    # server-rendered here) so it shares the app's styling and can call back
    # into the API client the same way the rest of the SPA does.
    landing_url = f"{settings.FRONTEND_URL.split(',')[0]}/sim/{token}"
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


# The fake-login landing page used to be rendered here as a raw HTML string.
# It now lives as a real frontend route (frontend/src/pages/SimLanding.tsx at
# /sim/:token) so it shares the app's styling/build pipeline and can reuse
# the same API client — track_click above redirects there instead.
