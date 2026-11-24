"""Registration refuses invalid fields with a 422 that says why.

In production a username with a space or a password without a lowercase
letter answered 500: the 422's detail carried the validators' ValueError
objects, which do not serialise, and the traceback logged the raw input,
password included.
"""

import pytest

from app.models.user import User

PASSWORD = "MANIT@123"


@pytest.mark.parametrize(
    "fields, field, message",
    [
        (
            {"username": "Has Space", "password": "Passw0rdd"},
            "username",
            "Username must be alphanumeric",
        ),
        (
            {"username": "valid_name", "password": PASSWORD},
            "password",
            "at least one lowercase letter",
        ),
    ],
)
async def test_invalid_fields_answer_422_naming_the_problem(
    anon_client, fields, field, message
):
    resp = await anon_client.post(
        "/api/auth/register",
        data={"email": "new@example.com", "mobile": "9876543210", **fields},
    )

    assert resp.status_code == 422
    [error] = resp.json()["detail"]
    assert error["loc"] == [field]
    assert message in error["msg"]
    assert await User.find_all().count() == 0


async def test_the_refusal_does_not_echo_what_was_sent(anon_client, caplog):
    resp = await anon_client.post(
        "/api/auth/register",
        data={
            "username": "Has Space",
            "email": "new@example.com",
            "password": PASSWORD,
            "mobile": "9876543210",
        },
    )

    assert resp.status_code == 422
    assert PASSWORD not in resp.text
    assert all("input" not in error for error in resp.json()["detail"])
    assert PASSWORD not in caplog.text
