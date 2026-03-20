from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from uuid import uuid4

import cloudinary
import cloudinary.api
import cloudinary.uploader
from fastapi import HTTPException, UploadFile, status

from config.settings import settings

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/png",
    "image/x-png",
    "image/svg+xml",
    "image/svg",
    "image/webp",
    "image/avif",
    "image/heic",
    "image/heif",
    "application/octet-stream",
}
ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".svg",
    ".webp",
    ".avif",
    ".heic",
    ".heif",
}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB


class CloudinaryConfigError(RuntimeError):
    """Raised when Cloudinary environment variables are missing."""


def _configure_cloudinary() -> None:
    if not (
        settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    ):
        raise CloudinaryConfigError(
            "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
        )

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=settings.cloudinary_secure,
    )


def validate_image_upload(file: UploadFile) -> None:
    filename = (file.filename or "").strip()
    extension = Path(filename).suffix.lower()
    content_type = (file.content_type or "").lower().strip()

    # Some clients send generic or aliased MIME types; allow those when extension is valid.
    content_type_allowed = content_type in ALLOWED_MIME_TYPES
    extension_allowed = extension in ALLOWED_EXTENSIONS

    if not content_type_allowed and not extension_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid file type. Allowed extensions: "
                f"{', '.join(sorted(ALLOWED_EXTENSIONS))}. "
                f"Received content_type='{file.content_type}', filename='{file.filename}'."
            ),
        )

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB",
        )


async def upload_image(
    file: UploadFile,
    *,
    folder: str,
    public_id_prefix: str,
    overwrite: bool = True,
) -> dict[str, Any]:
    """Upload an image to Cloudinary and return the raw Cloudinary response."""
    validate_image_upload(file)

    try:
        _configure_cloudinary()
    except CloudinaryConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    # Ensure stream starts at 0 before passing to SDK.
    file.file.seek(0)
    folder_path = "/".join(
        [p for p in [settings.cloudinary_default_folder, folder] if p]
    )

    def _do_upload() -> dict[str, Any]:
        return cloudinary.uploader.upload(
            file=file.file,
            resource_type="image",
            folder=folder_path,
            public_id=f"{public_id_prefix}_{uuid4().hex}",
            overwrite=overwrite,
            unique_filename=False,
            use_filename=False,
            transformation=[
                {"quality": "auto"},
                {"fetch_format": "auto"},
            ],
        )

    return await asyncio.to_thread(_do_upload)


async def delete_image(public_id: str) -> bool:
    """Delete an image from Cloudinary by public_id."""
    if not public_id:
        return False

    try:
        _configure_cloudinary()
    except CloudinaryConfigError:
        return False

    def _do_delete() -> dict[str, Any]:
        return cloudinary.uploader.destroy(public_id, invalidate=True)

    result = await asyncio.to_thread(_do_delete)
    return result.get("result") in {"ok", "not found"}
