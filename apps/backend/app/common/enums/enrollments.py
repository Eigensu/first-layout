from enum import Enum


class EnrollmentStatus(str, Enum):
    ACTIVE = "active"
    REMOVED = "removed"
