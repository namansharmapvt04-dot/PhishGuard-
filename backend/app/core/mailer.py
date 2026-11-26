"""
Outbound email via Mailjet's HTTP transactional-email API.
https://dev.mailjet.com/email/guides/send-api-v31/

Previously Resend — its sandbox mode (no verified domain) can only send TO
the email address the Resend account itself signed up with, blocking any
real target/demo recipient. Then Brevo — whose fraud-detection system
disabled the account's sending ability outright ("Your sending platform is
currently disabled"), a manual-review block unrelated to our code or
config. Mailjet's free tier (200/day) sends to any recipient once a single
sender address is verified (no domain/DNS needed), and — like the others —
it's an HTTPS API, so Render's outbound-SMTP block (port 587/25) doesn't apply.
"""
import re

import httpx
import structlog

from app.config import settings

log = structlog.get_logger(__name__)

MAILJET_API_URL = "https://api.mailjet.com/v3.1/send"


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


_HREF_RE = re.compile(r'href\s*=\s*(["\'])(.*?)\1', re.IGNORECASE | re.DOTALL)
_BARE_URL_RE = re.compile(r'https?://[^\s<>"\')]+', re.IGNORECASE)
# Matches {TRACKING_LINK} or {{TRACKING_LINK}} written as plain prose, not
# inside an href — by the time this runs, _HREF_RE above has already
# rewritten any properly-formed `<a href="{TRACKING_LINK}">`, so whatever
# still matches this must be bare text the model wrote outside a tag.
_TRACKING_PLACEHOLDER_RE = re.compile(r"\{\{?TRACKING_LINK\}\}?", re.IGNORECASE)
# Catches any other unresolved curly-brace token the model invented beyond
# the officially supported set (e.g. "{IT_Support_Manager}") — personalisation_agent.py
# only ever substitutes the tokens it knows about via plain .replace(), so an
# invented one survives all the way here untouched. Run last, after the
# TRACKING_LINK-specific handling above, so it can never eat that one first.
_ANY_PLACEHOLDER_RE = re.compile(r"\{[A-Za-z0-9_]+\}")


def inject_tracking(body_html: str, base_url: str, tracking_token: str) -> str:
    """Rewrite every link to go through the click-tracking redirect, and
    append the open-tracking pixel."""
    if not base_url or not tracking_token:
        raise ValueError(
            f"inject_tracking requires both base_url and tracking_token "
            f"(got base_url={base_url!r}, tracking_token={tracking_token!r})"
        )
    body_html = _ensure_html(body_html)
    click_url = f"{base_url}/track/click/{tracking_token}"

    def _rewrite_href(m: re.Match) -> str:
        quote, value = m.group(1), m.group(2)
        if value.strip().lower().startswith("mailto:"):
            return m.group(0)
        return f"href={quote}{click_url}{quote}"

    # Matches both href="..." and href='...' — the prior version was
    # double-quote-only, so any LLM-generated single-quoted href (or one
    # copied verbatim from a RAG few-shot example) slipped through
    # untouched and could point a recipient straight at an invented,
    # non-existent domain (DNS_PROBE_FINISHED_NXDOMAIN on click).
    tracked = _HREF_RE.sub(_rewrite_href, body_html)

    # Defense in depth: a model-invented URL never wrapped in a proper
    # href (plain text in the body) wouldn't be caught by the rewrite
    # above, and most email clients auto-linkify bare URLs anyway — swap
    # out anything that still looks like a URL after the href pass too.
    tracked = _BARE_URL_RE.sub(lambda m: click_url if m.group(0) != click_url else m.group(0), tracked)

    # The bug this fixes: the model sometimes writes {TRACKING_LINK} as
    # plain prose ("Click {TRACKING_LINK} to verify...") instead of inside
    # an <a href>. Neither pass above touches that — it's not an href and
    # not a bare URL — so it used to survive into the sent email as raw
    # text *and* trigger the fallback CTA below, shipping two links. Turn
    # it into a real anchor here so the fallback check after this sees the
    # link already present and skips.
    tracked = _TRACKING_PLACEHOLDER_RE.sub(f'<a href="{click_url}">Click here to verify</a>', tracked)

    # Last-resort guarantee: if the body had neither an href, a bare URL,
    # nor even {TRACKING_LINK} text at all (the model ignored the
    # instruction entirely), every pass above is a no-op and the email
    # would ship with zero clickable link — defeating the whole simulation.
    # Append an explicit CTA rather than let that happen silently.
    if click_url not in tracked:
        tracked += f'<p><a href="{click_url}">Verify Account Details</a></p>'

    # Final sweep: strip any other unresolved {PLACEHOLDER} the model
    # invented (anything beyond the known template variables, which
    # personalisation_agent.py has already substituted by this point) so a
    # stray raw token can never leak into an outbound email. Safe to run
    # now — the real tracking link above is already a plain URL with no
    # braces in it.
    tracked = _ANY_PLACEHOLDER_RE.sub("", tracked)

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
    if not settings.MAILJET_API_KEY or not settings.MAILJET_API_SECRET:
        raise MailerNotConfigured("MAILJET_API_KEY/MAILJET_API_SECRET not set")

    payload = {
        "Messages": [
            {
                "From": {"Email": settings.MAILJET_SENDER_EMAIL, "Name": sender_name or "PhishGuard"},
                "To": [{"Email": to_email, "Name": to_name or to_email}],
                "Subject": subject,
                "HTMLPart": html_body,
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                MAILJET_API_URL,
                auth=(settings.MAILJET_API_KEY, settings.MAILJET_API_SECRET),
                json=payload,
            )
        if response.status_code >= 400:
            detail = response.text
            try:
                body = response.json()
                detail = body.get("ErrorMessage") or body.get("Messages", [{}])[0].get("Errors", detail)
            except (ValueError, IndexError, KeyError):
                pass
            raise MailerError(f"Mailjet API error ({response.status_code}): {detail}")
        # Mailjet returns 200 even for a per-recipient failure — the real
        # status is nested per-message, e.g. "success" vs "error".
        body = response.json()
        msg_status = body.get("Messages", [{}])[0].get("Status")
        if msg_status != "success":
            raise MailerError(f"Mailjet send not successful: {body}")
    except httpx.HTTPError as e:
        log.warning("mailer.send_failed", error=str(e), to=to_email)
        raise MailerError(f"Mailjet request failed: {e}") from e
    log.info("mailer.sent", to=to_email)
