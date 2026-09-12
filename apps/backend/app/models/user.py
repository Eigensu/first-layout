from datetime import datetime
from typing import List, Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pymongo import IndexModel

# merge_state values. A merged account is "clean"; one the migration declined to
# merge automatically is "needs_review" until someone rules on it.
MERGE_STATE_CLEAN = "clean"
MERGE_STATE_NEEDS_REVIEW = "needs_review"
MERGE_STATE_REVIEWED = "reviewed"


class LegacyHash(BaseModel):
    """A password hash carried over from one of the pre-unification accounts.

    Merging two accounts leaves two valid passwords, and the user remembers
    whichever one they last used. Rather than pick and lock someone out, every
    hash is kept and accepted at login; the first successful use promotes it to
    the primary and clears the rest, so the extra secrets exist only until that
    person next signs in.
    """

    hashed_password: str
    source_db: str
    legacy_user_id: PydanticObjectId
    last_login: Optional[datetime] = None


class LegacyAccountRef(BaseModel):
    """Where one of this account's pre-unification rows came from.

    Kept permanently. It is what makes "which old account was this?" answerable
    for support, and what a split would be rebuilt from if a merge turns out to
    have joined two different people.
    """

    source_db: str
    legacy_user_id: PydanticObjectId
    username: str
    email: Optional[str] = None
    mobile: Optional[str] = None
    created_at: Optional[datetime] = None


class User(Document):
    """User document model for MongoDB using Beanie ODM"""

    username: Indexed(str, unique=True)  # type: ignore
    email: Indexed(EmailStr, unique=True)  # type: ignore

    # --- identity, post-unification ----------------------------------------
    # Merging on "mobile OR email" means one person can legitimately end up
    # owning two numbers and two addresses. A scalar field would silently drop
    # the second and lock them out of the credential they actually remember, so
    # identity is an array per channel and merging is a set union. The scalar
    # `email`/`mobile`/`google_id` above stay as the primary -- always [0] --
    # so every existing read path keeps working untouched.
    #
    # Empty until the backfill populates them; see app/services/auth/identity.py.
    emails: List[str] = Field(default_factory=list)
    mobiles: List[str] = Field(default_factory=list)
    google_ids: List[str] = Field(default_factory=list)
    # Optional because Google-signup accounts have no password until the
    # user sets one (see auth_provider).
    hashed_password: Optional[str] = None
    auth_provider: str = "password"  # "password" | "google"
    google_id: Optional[str] = None
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    is_active: bool = True
    deleted_at: Optional[datetime] = None
    deletion_reason: Optional[str] = None
    is_verified: bool = False
    is_admin: bool = False
    # Replaces is_admin, which stays until the migration can tell a platform
    # admin from a tournament admin. Merging accounts means someone who
    # administered one tournament would otherwise inherit every tournament, so
    # this is granted only from an explicit allowlist rather than carried over.
    is_platform_admin: bool = False

    # --- provenance --------------------------------------------------------
    legacy_hashes: List[LegacyHash] = Field(default_factory=list)
    legacy_accounts: List[LegacyAccountRef] = Field(default_factory=list)
    merge_state: str = MERGE_STATE_CLEAN
    merge_group_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    avatar_url: Optional[str] = None
    avatar_file_id: Optional[str] = None  # GridFS file id for avatar

    class Settings:
        name = "users"  # MongoDB collection name
        use_state_management = True
        indexes = [
            "username",
            "email",
            "google_id",
            [("created_at", -1)],
            # Database-level guarantee that one mobile belongs to one account.
            # The duplicate checks in the register and profile-update routes
            # are read-then-write and so are racy under concurrent requests;
            # this closes that window. It also gives the number lookups in
            # login and password reset an index to use.
            # The partial filter exempts accounts with no mobile: null and
            # missing values would otherwise all collide with each other.
            IndexModel(
                [("mobile", 1)],
                unique=True,
                partialFilterExpression={"mobile": {"$type": "string"}},
                name="uniq_mobile",
            ),
            # One credential belongs to one person, enforced per channel.
            #
            # Every one of these carries a partial filter on `<field>.0`, and
            # not only the ones the spec called for. A unique index over a
            # field that no existing document has indexes every row as the same
            # missing key, so creating it would fail outright on a collection
            # holding more than one user -- and Beanie builds indexes during
            # init_beanie, which means the service would not start. The filter
            # excludes rows that have not been backfilled yet, so the
            # constraint binds new and migrated accounts while old ones are
            # simply not in the index.
            #
            # Unique multikey indexes de-duplicate keys within a document, so
            # the same value appearing twice in one account's array is fine;
            # only two accounts sharing a value collide, which is the point.
            IndexModel(
                [("emails", 1)],
                unique=True,
                partialFilterExpression={"emails.0": {"$exists": True}},
                name="uniq_emails",
            ),
            IndexModel(
                [("mobiles", 1)],
                unique=True,
                partialFilterExpression={"mobiles.0": {"$exists": True}},
                name="uniq_mobiles",
            ),
            IndexModel(
                [("google_ids", 1)],
                unique=True,
                partialFilterExpression={"google_ids.0": {"$exists": True}},
                name="uniq_google_ids",
            ),
            "merge_state",
        ]

    def __repr__(self):
        return f"<User {self.username}>"

    def __str__(self):
        return self.username


class RefreshToken(Document):
    """Refresh token document model for MongoDB"""

    user_id: PydanticObjectId
    token: Indexed(str, unique=True)  # type: ignore
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked: bool = False

    class Settings:
        name = "refresh_tokens"
        indexes = [
            "token",
            "user_id",
            [("expires_at", 1)],  # TTL index for auto-deletion
        ]


class UserProfile(Document):
    """Optional: User profile document for additional user data"""

    user_id: Indexed(PydanticObjectId, unique=True)  # type: ignore
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    social_links: Optional[dict] = None
    preferences: Optional[dict] = None

    class Settings:
        name = "user_profiles"
        indexes = ["user_id"]
