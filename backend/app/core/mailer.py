"""
Outbound email via Brevo's transactional email API.
https://developers.brevo.com/reference/sendtransacemail
"""
import re

import httpx
import structlog

from app.config import settings

log = structlog.get_logger(__name__)

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


class MailerNotConfigured(Exception):
    pass


class MailerError(Exception):
    pass


def _ensure_html(body: str) -> str:
    """
    The generator LLM is asked for "HTML-safe" output but — especially with
    smaller models — often just returns plain text with \\n line breaks.
    HTML ignores bare newlines, so that collapses into one run-on paragraph
    (looks exactly like spam). If there's no block-level HTML already, treat
    it as plain text and convert blank-line-separated paragraphs to <p>.
    """
    if re.search(r"<(p|br|div|table)[\s/>]", body, re.IGNORECASE):
        return body
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]
    return "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs)


def inject_tracking(body_html: str, base_url: str, tracking_token: str) -> str:
    """Rewrite every link to go through the click-tracking redirect, and
    append the open-tracking pixel."""
    body_html = _ensure_html(body_html)
    click_url = f"{base_url}/track/click/{tracking_token}"
    tracked = re.sub(r'href="[^"]*"', f'href="{click_url}"', body_html)
    pixel = f'<img src="{base_url}/track/open/{tracking_token}" width="1" height="1" style="display:none" alt="">'
    return f"{tracked}{pixel}"


async def send_email(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    sender_name: str,
) -> None:
    if not settings.BREVO_API_KEY or not settings.BREVO_SENDER_EMAIL:
        raise MailerNotConfigured("BREVO_API_KEY / BREVO_SENDER_EMAIL not set")

    payload = {
        "sender": {"name": sender_name or "PhishGuard", "email": settings.BREVO_SENDER_EMAIL},
        "to": [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html_body,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            BREVO_SEND_URL,
            json=payload,
            headers={"api-key": settings.BREVO_API_KEY, "content-type": "application/json"},
        )
    if resp.status_code >= 300:
        log.warning("mailer.send_failed", status=resp.status_code, body=resp.text[:300], to=to_email)
        raise MailerError(f"Brevo {resp.status_code}: {resp.text[:300]}")
    log.info("mailer.sent", to=to_email)
