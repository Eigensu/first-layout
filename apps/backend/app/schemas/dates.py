from datetime import datetime

from pydantic import BaseModel, field_validator

from app.common.datetime_utils import to_ist


class DatesInIST(BaseModel):
    """Base for responses: every datetime field leaves the API in IST.

    Stored and freshly made dates are both naive UTC, which a browser reads as
    local time. With the IST offset on, they mean one instant everywhere.
    """

    @field_validator("*", mode="before")
    @classmethod
    def ensure_ist(cls, v):
        if isinstance(v, datetime):
            return to_ist(v)
        return v
