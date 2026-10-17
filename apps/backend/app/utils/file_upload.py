import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile, status

# Allowed file extensions and MIME types
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".svg", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/svg+xml", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# Upload directories
BASE_UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
SPONSOR_UPLOAD_DIR = BASE_UPLOAD_DIR / "sponsors"
USER_UPLOAD_DIR = BASE_UPLOAD_DIR / "users"

SPONSOR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
USER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def validate_image_file(file: UploadFile) -> None:
    """Validate uploaded image file"""

    # Check MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_MIME_TYPES)}",
        )

    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS)}",
        )


async def save_upload_file(file: UploadFile, sponsor_id: str) -> str:
    """
    Save uploaded file to local storage

    Args:
        file: The uploaded file
        sponsor_id: ID of the sponsor

    Returns:
        str: Path to the saved file (relative to upload directory)
    """
    validate_image_file(file)

    # Generate unique filename
    file_ext = Path(file.filename).suffix.lower()
    unique_filename = f"{sponsor_id}_{uuid.uuid4().hex}{file_ext}"
    file_path = SPONSOR_UPLOAD_DIR / unique_filename

    # Check file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB",
        )

    # Save file
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}",
        )

    # Return relative path (can be converted to URL in the route)
    return f"/uploads/sponsors/{unique_filename}"


async def save_user_avatar(file: UploadFile, user_id: str) -> str:
    """
    Save uploaded user avatar to local storage

    Args:
        file: The uploaded file
        user_id: ID of the user

    Returns:
        str: Relative URL to the saved avatar
    """
    validate_image_file(file)

    file_ext = Path(file.filename).suffix.lower()
    unique_filename = f"{user_id}_{uuid.uuid4().hex}{file_ext}"
    file_path = USER_UPLOAD_DIR / unique_filename

    # Check file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB",
        )

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}",
        )

    return f"/uploads/users/{unique_filename}"


def delete_upload_file(file_path: str) -> bool:
    """
    Delete uploaded file from storage

    Args:
        file_path: Path to the file (relative or absolute)

    Returns:
        bool: True if deleted successfully, False otherwise
    """
    try:
        # Handle both relative and absolute paths
        if file_path.startswith("/uploads/"):
            full_path = Path(
                __file__
            ).resolve().parent.parent.parent / file_path.lstrip("/")
        else:
            full_path = Path(file_path)

        if full_path.exists():
            full_path.unlink()
            return True
        return False
    except Exception as e:
        print(f"Error deleting file {file_path}: {e}")
        return False


# TODO: For production, implement cloud storage (AWS S3, Cloudinary, etc.)
# Uncomment and implement the following functions when ready:

# async def upload_to_s3(file: UploadFile, sponsor_id: str) -> str:
#     """Upload file to AWS S3"""
#     import boto3
#     from botocore.exceptions import ClientError
#
#     validate_image_file(file)
#
#     s3_client = boto3.client(
#         's3',
#         aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
#         aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
#         region_name=os.getenv('AWS_REGION', 'us-east-1')
#     )
#
#     bucket_name = os.getenv('AWS_S3_BUCKET')
#     file_ext = Path(file.filename).suffix.lower()
#     file_key = f"sponsors/{sponsor_id}_{uuid.uuid4().hex}{file_ext}"
#
#     try:
#         s3_client.upload_fileobj(
#             file.file,
#             bucket_name,
#             file_key,
#             ExtraArgs={'ContentType': file.content_type, 'ACL': 'public-read'}
#         )
#         return f"https://{bucket_name}.s3.amazonaws.com/{file_key}"
#     except ClientError as e:
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Failed to upload to S3: {str(e)}"
#         )


# async def upload_to_cloudinary(file: UploadFile, sponsor_id: str) -> str:
#     """Upload file to Cloudinary"""
#     import cloudinary
#     import cloudinary.uploader
#
#     validate_image_file(file)
#
#     cloudinary.config(
#         cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
#         api_key=os.getenv('CLOUDINARY_API_KEY'),
#         api_secret=os.getenv('CLOUDINARY_API_SECRET')
#     )
#
#     try:
#         result = cloudinary.uploader.upload(
#             file.file,
#             folder="sponsors",
#             public_id=f"{sponsor_id}_{uuid.uuid4().hex}",
#             transformation=[
#                 {"width": 400, "height": 400, "crop": "fit"},
#                 {"quality": "auto"}
#             ]
#         )
#         return result["secure_url"]
#     except Exception as e:
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Failed to upload to Cloudinary: {str(e)}"
#         )
