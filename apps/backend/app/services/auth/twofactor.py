import logging
from typing import Optional, Tuple

import httpx

from config.settings import get_settings

settings = get_settings()
logger = logging.getLogger("app.twofactor")

BASE_URL = getattr(settings, "twofactor_base_url", "https://2factor.in/API/V1")
API_KEY = getattr(settings, "twofactor_api_key", None)
TEMPLATE_NAME = getattr(settings, "twofactor_template_name", None)


async def send_otp_autogen(
    phone: str, template_name: Optional[str] = None
) -> Tuple[bool, Optional[str], Optional[str]]:
    tpl = template_name or TEMPLATE_NAME
    if not API_KEY or not tpl:
        logger.error(
            "2Factor config missing: api_key=%s, template=%s", bool(API_KEY), bool(tpl)
        )
        return False, None, "Missing 2Factor configuration"
    url = f"{BASE_URL}/{API_KEY}/SMS/{phone}/AUTOGEN/{tpl}"
    logger.info("2Factor AUTOGEN GET %s", url.replace(API_KEY or "", "[redacted]"))
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url)
            data = resp.json()
            if resp.status_code == 200 and str(data.get("Status")).lower() == "success":
                return True, data.get("Details"), None
            return (
                False,
                None,
                data.get("Details") or data.get("Message") or "Failed to send OTP",
            )
        except Exception as e:
            return False, None, str(e)


async def verify_otp(provider_session_id: str, otp: str) -> Tuple[bool, Optional[str]]:
    if not API_KEY:
        logger.error("2Factor config missing: api_key=%s", bool(API_KEY))
        return False, "Missing 2Factor configuration"
    url = f"{BASE_URL}/{API_KEY}/SMS/VERIFY/{provider_session_id}/{otp}"
    logger.info(
        "2Factor VERIFY GET %s",
        url.replace(API_KEY or "", "[redacted]").replace(otp, "[redacted]"),
    )
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url)
            data = resp.json()
            if resp.status_code == 200 and str(data.get("Status")).lower() == "success":
                return True, None
            return (
                False,
                data.get("Details") or data.get("Message") or "OTP verification failed",
            )
        except Exception as e:
            return False, str(e)
