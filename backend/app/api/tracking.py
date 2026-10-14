"""
Public tracking endpoints — called by the tracking pixel and landing page.
No auth required; authenticated only by the per-target tracking_token.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import select
import structlog

from app.database import get_db
from app.models.target import Target, TargetStatus
from app.models.tracking import TrackingEvent, EventType
from app.config import settings

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/track", tags=["tracking"])
landing_router = APIRouter(tags=["tracking"])

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


@landing_router.get("/phish/{token}", response_class=HTMLResponse)
async def phish_landing(token: str):
    """
    Fake login page a clicked link lands on. Discloses the simulation
    immediately and up front, then offers a mock login form that reports
    a (non-)submission — no credentials are ever captured or stored.
    """
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Security check</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ font-family: -apple-system, Arial, sans-serif; background: #f6f7f9; margin: 0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }}
  .card {{ background: #fff; border: 1px solid #e3e6eb; border-radius: 12px; padding: 32px;
          max-width: 420px; width: 100%; }}
  .banner {{ background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; border-radius: 8px;
             padding: 12px 16px; font-size: 14px; margin-bottom: 20px; }}
  h1 {{ font-size: 18px; margin: 0 0 16px; }}
  label {{ display: block; font-size: 12px; color: #64748b; margin: 12px 0 4px; }}
  input {{ width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #c7cdd6;
          border-radius: 6px; font-size: 14px; }}
  button {{ margin-top: 18px; width: 100%; padding: 10px; background: #0f766e; color: #fff;
           border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }}
  #result {{ margin-top: 16px; font-size: 14px; }}
</style></head>
<body>
  <div class="card">
    <div class="banner">
      ⚠️ This was a simulated phishing email from your organisation's security
      awareness programme. No real credentials are collected on this page.
    </div>
    <h1>Sign in to continue</h1>
    <form id="f">
      <label>Email or username</label>
      <input type="text" placeholder="you@company.com">
      <label>Password</label>
      <input type="password" placeholder="••••••••">
      <button type="submit">Sign in</button>
    </form>
    <div id="result"></div>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {{
      e.preventDefault();
      await fetch('/track/submit/{token}', {{ method: 'POST' }});
      document.getElementById('result').innerHTML =
        '<strong>This was a phishing simulation.</strong> Nothing was submitted. ' +
        'If this were real, report it to your security team.';
      document.getElementById('f').style.display = 'none';
    }});
  </script>
</body></html>"""
