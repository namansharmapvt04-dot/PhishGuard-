"""
Outbound email via Gmail SMTP (a regular Gmail account + App Password).
https://support.google.com/accounts/answer/185833
"""
import re
from email.message import EmailMessage

import aiosmtplib
import structlog

from app.config import settings

log = structlog.get_logger(__name__)

GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 587


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
    if not settings.GMAIL_ADDRESS or not settings.GMAIL_APP_PASSWORD:
        raise MailerNotConfigured("GMAIL_ADDRESS / GMAIL_APP_PASSWORD not set")

    message = EmailMessage()
    message["From"] = f"{sender_name or 'PhishGuard'} <{settings.GMAIL_ADDRESS}>"
    message["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    message["Subject"] = subject
    message.set_content("This email requires an HTML-capable client to view.")
    message.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            message,
            hostname=GMAIL_SMTP_HOST,
            port=GMAIL_SMTP_PORT,
            start_tls=True,
            username=settings.GMAIL_ADDRESS,
            password=settings.GMAIL_APP_PASSWORD,
            timeout=20,
        )
    except aiosmtplib.SMTPException as e:
        log.warning("mailer.send_failed", error=str(e), to=to_email)
        raise MailerError(f"Gmail SMTP error: {e}") from e
    log.info("mailer.sent", to=to_email)
