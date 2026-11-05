"""Email codes, delivered by Resend (spec §5.3-5.4).

Shaped like twofactor.py so the two channels read the same way, with one
difference that matters: 2Factor generates and holds an SMS code, while Resend
only delivers mail. On this channel we generate the code, the session keeps a
keyed hash of it, and we check it ourselves.

Settings are read when a message is sent, not at import, so the channel turns
on when RESEND_API_KEY and RESEND_FROM_EMAIL are set and the service restarts.
"""

import hashlib
import hmac
import html
import logging
import secrets
from typing import Optional, Tuple

import httpx

from app.models.password_reset import PURPOSE_EMAIL_CHANGE
from config.settings import get_settings

settings = get_settings()
logger = logging.getLogger("app.email_otp")

RESEND_URL = "https://api.resend.com/emails"

# Used when a request names no tournament: the apex site, and the legacy
# single-tournament services, which have no registry row to take a name from.
DEFAULT_BRAND = "Wall-E Arena"


def is_configured() -> bool:
    return bool(settings.resend_api_key and settings.resend_from_email)


def generate_otp() -> str:
    # secrets, never random: this code is the whole credential for a reset.
    return f"{secrets.randbelow(10**6):06d}"


def hash_otp(code: str, session_id) -> str:
    """Keyed HMAC, not a bare digest.

    A six-digit code is 10^6 possibilities, so a plain SHA-256 of one is
    reversed instantly if the collection ever leaks. Keyed with SECRET_KEY, a
    leak alone is not enough. The session id is in the message so one code in
    two sessions does not hash alike.
    """
    return hmac.new(
        settings.secret_key.encode(), f"{session_id}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def otp_matches(code: str, session_id, stored_hash: Optional[str]) -> bool:
    if not stored_hash:
        return False
    return hmac.compare_digest(hash_otp(code.strip(), session_id), stored_hash)


def render_otp_email(
    code: str, brand: str, purpose: str, expiry_seconds: int, address: str
) -> Tuple[str, str, str]:
    """Subject, plain text and HTML for one code.

    The code leads the subject, so the notification preview shows it and the
    message often never needs opening.
    """
    minutes = max(1, expiry_seconds // 60)
    if purpose == PURPOSE_EMAIL_CHANGE:
        subject = f"{code} is your {brand} email confirmation code"
        lead = f"Use this code to make {address} the email on your {brand} account:"
        ignore = (
            "If you didn't ask for this, you can ignore this email. Nothing "
            "changes until the code is entered."
        )
    else:
        subject = f"{code} is your {brand} password reset code"
        lead = f"Use this code to reset your {brand} password:"
        ignore = (
            "If you didn't ask to reset your password, you can ignore this "
            "email. Your password hasn't changed."
        )
    expiry = f"It expires in {minutes} minutes. Never share it with anyone."
    text = f"{lead}\n\n{code}\n\n{expiry}\n\n{ignore}\n"
    body = (
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,'
        'sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">'
        f'<p style="font-size:16px;margin:0 0 16px">{html.escape(lead)}</p>'
        '<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px">'
        f"{code}</p>"
        f'<p style="font-size:14px;color:#475569;margin:0 0 12px">{html.escape(expiry)}</p>'
        f'<p style="font-size:14px;color:#475569;margin:0">{html.escape(ignore)}</p>'
        "</div>"
    )
    return subject, text, body


async def send_otp_email(
    to: str,
    code: str,
    purpose: str,
    idempotency_key: str,
    brand: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    """Mail one code. Returns (ok, error).

    Never logs the code, the key or the address.
    """
    if not is_configured():
        logger.error(
            "Resend config missing: api_key=%s, from=%s",
            bool(settings.resend_api_key),
            bool(settings.resend_from_email),
        )
        return False, "Missing Resend configuration"
    subject, text, body = render_otp_email(
        code, brand or DEFAULT_BRAND, purpose, settings.otp_expiry_seconds, to
    )
    payload = {
        "from": settings.resend_from_email,
        "to": [to],
        "subject": subject,
        "text": text,
        "html": body,
    }
    if settings.resend_reply_to:
        payload["reply_to"] = settings.resend_reply_to
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        # Resend honours this for 24 hours, so a retried send cannot mail a
        # second code for the same session.
        "Idempotency-Key": idempotency_key,
    }
    logger.info("Resend POST /emails purpose=%s", purpose)
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(RESEND_URL, json=payload, headers=headers)
        except httpx.HTTPError as e:
            logger.warning("Resend unreachable: %s", type(e).__name__)
            return False, "Could not reach Resend"
    if resp.is_success:
        return True, None
    try:
        message = str(resp.json().get("message") or "")
    except ValueError:
        message = ""
    message = message.replace(to, "[redacted]")
    logger.warning(
        "Resend refused the send: status=%s message=%s", resp.status_code, message
    )
    return False, message or f"Resend answered {resp.status_code}"
