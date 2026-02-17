from typing import Optional, Tuple
from fastapi import UploadFile, HTTPException, status
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from gridfs import NoFile
from config.database import get_database

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/webp",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def _validate_image_file(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}")


async def upload_avatar_to_gridfs(file: UploadFile, filename_prefix: str) -> str:
    """
    Store the uploaded avatar in MongoDB GridFS and return the file_id as a string.
    """
    _validate_image_file(file)

    # Size check
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB",
        )

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="avatars")

    # Read bytes and upload
    data = file.file.read()
    filename = f"{filename_prefix}"
    metadata = {"content_type": file.content_type}

    file_id = await bucket.upload_from_stream(filename, data, metadata=metadata)
    return str(file_id)


async def open_avatar_stream(file_id: str):
    """
    Open a download stream for the avatar file stored in GridFS.
    Returns (stream, content_type)
    """
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file id")

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="avatars")

    try:
        stream = await bucket.open_download_stream(oid)
    except NoFile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")

    # contentType can be on file document metadata
    file_doc = await bucket.find({"_id": oid}).to_list(length=1)
    content_type: Optional[str] = None
    if file_doc:
        # file_doc[0] is a dict with optional 'metadata'
        meta = file_doc[0].get("metadata") or {}
        content_type = meta.get("content_type")

    return stream, (content_type or "application/octet-stream")


async def delete_sponsor_logo_from_gridfs(file_id: str) -> bool:
    """Delete a sponsor logo file from the 'sponsor_logos' GridFS bucket"""
    try:
        oid = ObjectId(file_id)
    except Exception:
        return False
    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="sponsor_logos")
    try:
        await bucket.delete(oid)
        return True
    except Exception:
        return False


async def delete_avatar_from_gridfs(file_id: str) -> bool:
    """Delete an avatar file from the 'avatars' GridFS bucket"""
    try:
        oid = ObjectId(file_id)
    except Exception:
        return False
    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="avatars")
    try:
        await bucket.delete(oid)
        return True
    except Exception:
        return False


async def upload_sponsor_logo_to_gridfs(file: UploadFile, filename_prefix: str) -> str:
    """Upload sponsor logo image to GridFS (bucket 'sponsor_logos') and return file id"""
    _validate_image_file(file)

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB",
        )

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="sponsor_logos")
    data = file.file.read()
    filename = f"{filename_prefix}"
    metadata = {"content_type": file.content_type}
    file_id = await bucket.upload_from_stream(filename, data, metadata=metadata)
    return str(file_id)


async def open_sponsor_logo_stream(file_id: str):
    """Open a download stream for sponsor logo from GridFS"""
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file id")

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="sponsor_logos")

    try:
        stream = await bucket.open_download_stream(oid)
    except NoFile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found")

    file_doc = await bucket.find({"_id": oid}).to_list(length=1)
    content_type: Optional[str] = None
    if file_doc:
        meta = file_doc[0].get("metadata") or {}
        content_type = meta.get("content_type")

    return stream, (content_type or "application/octet-stream")


async def upload_carousel_image_to_gridfs(file: UploadFile, filename_prefix: str) -> str:
    """Upload carousel image to GridFS (bucket 'carousel_images') and return file id"""
    _validate_image_file(file)

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB",
        )

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="carousel_images")
    data = file.file.read()
    filename = f"{filename_prefix}"
    metadata = {"content_type": file.content_type}
    file_id = await bucket.upload_from_stream(filename, data, metadata=metadata)
    return str(file_id)


async def open_carousel_image_stream(file_id: str):
    """Open a download stream for carousel image from GridFS"""
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file id")

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="carousel_images")

    try:
        stream = await bucket.open_download_stream(oid)
    except NoFile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    file_doc = await bucket.find({"_id": oid}).to_list(length=1)
    content_type: Optional[str] = None
    if file_doc:
        meta = file_doc[0].get("metadata") or {}
        content_type = meta.get("content_type")

    return stream, (content_type or "application/octet-stream")


async def delete_carousel_image_from_gridfs(file_id: str) -> bool:
    """Delete a carousel image file from the 'carousel_images' GridFS bucket"""
    try:
        oid = ObjectId(file_id)
    except Exception:
        return False
    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="carousel_images")
    try:
        await bucket.delete(oid)
        return True
    except Exception:
        return False

async def delete_contest_logo_from_gridfs(file_id: str) -> bool:
    """Delete a contest logo file from the 'contest_logos' GridFS bucket"""
    try:
        oid = ObjectId(file_id)
    except Exception:
        return False
    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="contest_logos")
    try:
        await bucket.delete(oid)
        return True
    except Exception:
        return False


async def upload_contest_logo_to_gridfs(file: UploadFile, filename_prefix: str) -> str:
    """Upload contest logo to GridFS (bucket 'contest_logos') and return file id"""
    _validate_image_file(file)

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB",
        )

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="contest_logos")
    data = file.file.read()
    filename = f"{filename_prefix}"
    metadata = {"content_type": file.content_type}
    file_id = await bucket.upload_from_stream(filename, data, metadata=metadata)
    return str(file_id)


async def open_contest_logo_stream(file_id: str):
    """Open a download stream for contest logo from GridFS"""
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file id")

    db: AsyncIOMotorDatabase = get_database()
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="contest_logos")

    try:
        stream = await bucket.open_download_stream(oid)
    except NoFile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found")

    file_doc = await bucket.find({"_id": oid}).to_list(length=1)
    content_type: Optional[str] = None
    if file_doc:
        meta = file_doc[0].get("metadata") or {}
        content_type = meta.get("content_type")

    return stream, (content_type or "application/octet-stream")
