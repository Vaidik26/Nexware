"""
Supabase Storage service for NexWare backend.
Handles upload/delete of files to Supabase Storage buckets.
"""
import logging
import uuid
from typing import Optional
from backend.config import settings

logger = logging.getLogger(__name__)

# Lazy import to avoid errors when SUPABASE_URL/KEY not configured
_supabase_client = None

from fastapi import HTTPException

def _get_client():
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_SERVICE_KEY == "PASTE_YOUR_SERVICE_ROLE_KEY_HERE":
            raise HTTPException(
                status_code=400,
                detail="Supabase storage is not configured in Vercel. Please add SUPABASE_URL and SUPABASE_SERVICE_KEY to your Environment Variables."
            )
        try:
            from supabase import create_client
            # Strip trailing/leading whitespace and quotes to prevent JWS errors
            url = settings.SUPABASE_URL.strip().strip("'").strip('"')
            key = settings.SUPABASE_SERVICE_KEY.strip().strip("'").strip('"')
            _supabase_client = create_client(url, key)
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="The 'supabase' python package is missing. Please ensure requirements.txt is updated."
            )
    return _supabase_client


def upload_to_supabase(
    file_bytes: bytes,
    original_filename: str,
    bucket: str,
    folder: str = "",
    content_type: str = "application/pdf",
) -> str:
    """
    Upload a file to Supabase Storage and return its public URL.

    Args:
        file_bytes: Raw file bytes to upload.
        original_filename: The original filename (used to derive extension).
        bucket: Supabase bucket name, e.g. 'Customer Confirmation'
        folder: Optional folder/path prefix inside the bucket.
        content_type: MIME type of the file.

    Returns:
        Public URL string of the uploaded file.
    """
    client = _get_client()
    ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "pdf"
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    path = f"{folder}/{unique_name}".lstrip("/") if folder else unique_name

    client.storage.from_(bucket).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "false"},
    )

    # Construct public URL
    public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"
    return public_url


def delete_from_supabase(bucket: str, file_url: str) -> None:
    """
    Delete a file from Supabase Storage given its public URL.
    Failure is non-critical and only logged — it must never raise an exception
    that propagates to the API caller.
    """
    try:
        client = _get_client()
        # Extract path from URL: .../object/public/{bucket}/{path}
        marker = f"/object/public/{bucket}/"
        if marker in file_url:
            path = file_url.split(marker, 1)[1]
            client.storage.from_(bucket).remove([path])
            logger.info("Deleted from Supabase storage: bucket=%s path=%s", bucket, path)
    except Exception as exc:
        logger.exception("Failed to delete file from Supabase storage (non-fatal): %s", exc)
