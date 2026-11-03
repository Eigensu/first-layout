"""Signature checks on the tokens the backend trusts.

Apple identity tokens are verified against Apple's published RSA keys, and our
own access tokens against JWT_SECRET_KEY. These sign real tokens with real keys
-- only the download of Apple's key set is replaced -- because the property
that matters is what the libraries accept, and the other tests stub the
verifier out entirely.

The attack these pin down is algorithm confusion: a token whose header says
HS256 and whose "signature" is an HMAC keyed with the *public* key, which an
attacker has. python-jose could be led into accepting it (CVE-2024-33663,
CVE-2026-85394), which is why it was replaced with PyJWT.
"""

import base64
import hashlib
import hmac
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from app.services.auth import apple
from app.services.auth.apple import AppleTokenError, verify_apple_identity_token
from app.utils.security import create_access_token, decode_token
from config.settings import settings

BUNDLE_ID = "com.walle.arena"
KID = "test-key-1"


@pytest.fixture(scope="module")
def apple_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def apple_keys(monkeypatch, apple_key):
    """Apple's key set, served from memory, and the verifier configured."""
    jwk = RSAAlgorithm.to_jwk(apple_key.public_key(), as_dict=True)
    jwk.update({"kid": KID, "alg": "RS256", "use": "sig"})
    fetches = []

    async def fetch():
        fetches.append(1)
        return [jwk]

    monkeypatch.setattr(apple, "_fetch_jwks", fetch)
    monkeypatch.setattr(apple, "_jwks_cache", {"keys": [], "fetched_at": 0.0})
    monkeypatch.setattr(settings, "apple_bundle_id", BUNDLE_ID)
    return fetches


def _claims(**overrides):
    now = int(time.time())
    claims = {
        "iss": apple.APPLE_ISSUER,
        "aud": BUNDLE_ID,
        "sub": "apple-sub-123",
        "email": "player@privaterelay.appleid.com",
        "iat": now,
        "exp": now + 600,
    }
    claims.update(overrides)
    return claims


def _signed(key, kid=KID, **overrides):
    return jwt.encode(
        _claims(**overrides), key, algorithm="RS256", headers={"kid": kid}
    )


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _hand_made(header: dict, claims: dict, signature: bytes) -> str:
    """A token built byte by byte, for the ones no library will sign."""
    signing_input = (
        f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(claims).encode())}"
    )
    return f"{signing_input}.{_b64(signature)}"


# --------------------------------------------------------------------------
# Apple identity tokens
# --------------------------------------------------------------------------


async def test_a_token_apple_signed_for_this_app_is_accepted(apple_keys, apple_key):
    payload = await verify_apple_identity_token(_signed(apple_key))

    assert payload["sub"] == "apple-sub-123"


async def test_an_hs256_token_keyed_with_apples_public_key_is_refused(
    apple_keys, apple_key
):
    """The algorithm-confusion forgery: anyone can compute this signature."""
    public_pem = apple_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    header = {"alg": "HS256", "typ": "JWT", "kid": KID}
    claims = _claims(sub="victim-apple-sub")
    signing_input = _hand_made(header, claims, b"").rsplit(".", 1)[0]
    forged_signature = hmac.new(
        public_pem, signing_input.encode(), hashlib.sha256
    ).digest()

    with pytest.raises(AppleTokenError):
        await verify_apple_identity_token(_hand_made(header, claims, forged_signature))


async def test_an_unsigned_token_is_refused(apple_keys):
    token = _hand_made({"alg": "none", "kid": KID}, _claims(), b"")

    with pytest.raises(AppleTokenError):
        await verify_apple_identity_token(token)


async def test_a_token_signed_by_another_key_is_refused(apple_keys):
    impostor = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    with pytest.raises(AppleTokenError):
        await verify_apple_identity_token(_signed(impostor))


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "com.someone.else"},
        {"iss": "https://appleid.example.com"},
        {"exp": int(time.time()) - 60},
    ],
    ids=["another-app", "another-issuer", "expired"],
)
async def test_a_token_not_meant_for_this_app_now_is_refused(
    apple_keys, apple_key, overrides
):
    with pytest.raises(AppleTokenError):
        await verify_apple_identity_token(_signed(apple_key, **overrides))


async def test_an_unknown_key_id_refetches_apples_keys_once(apple_keys, apple_key):
    with pytest.raises(AppleTokenError, match="key not found"):
        await verify_apple_identity_token(_signed(apple_key, kid="rotated-away"))

    # One fetch to fill the cache, one forced refresh for the unknown kid.
    assert len(apple_keys) == 2


async def test_garbage_is_refused(apple_keys):
    with pytest.raises(AppleTokenError):
        await verify_apple_identity_token("not-a-token")


async def test_apple_sign_in_off_until_configured(monkeypatch, apple_key):
    monkeypatch.setattr(settings, "apple_bundle_id", None)

    with pytest.raises(AppleTokenError, match="not configured"):
        await verify_apple_identity_token(_signed(apple_key))


# --------------------------------------------------------------------------
# our own access tokens
# --------------------------------------------------------------------------


def test_our_own_token_round_trips():
    token = create_access_token({"sub": "user-id-1"})

    assert decode_token(token)["sub"] == "user-id-1"


def test_a_token_signed_with_another_secret_is_refused():
    token = jwt.encode(
        {"sub": "user-id-1", "exp": int(time.time()) + 600},
        "some-other-secret-that-is-long-enough-000",
        algorithm=settings.jwt_algorithm,
    )

    assert decode_token(token) is None


def test_an_unsigned_access_token_is_refused():
    token = _hand_made(
        {"alg": "none", "typ": "JWT"},
        {"sub": "user-id-1", "exp": int(time.time()) + 600, "type": "access"},
        b"",
    )

    assert decode_token(token) is None
