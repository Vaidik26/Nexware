"""
Supabase Storage service for NexWare backend.
Handles upload/delete of files to Supabase Storage buckets.
"""
import base64
import json
import logging
import re
import uuid
from typing import Optional

from fastapi import HTTPException

from backend.config import settings

logger = logging.getLogger(__name__)

# Lazy import to avoid errors when SUPABASE_URL/KEY not configured
_supabase_client = None

_PLACEHOLDER_KEYS = {"PASTE_YOUR_SERVICE_ROLE_KEY_HERE", "your-service-role-key"}

# Kept strictly ASCII: this string is logged, and a cp1252 console (Windows dev)
# raises UnicodeEncodeError on em-dashes and ellipses, turning a helpful
# diagnostic into a crash inside the logger.
_WRONG_KEY_MESSAGE = (
    "SUPABASE_SERVICE_KEY holds a '{role}' key, not a service-role key. "
    "Uploads run server-side and must bypass Row Level Security, which only the "
    "service-role key can do; an anon/publishable key is rejected by RLS with "
    "'new row violates row-level security policy'. "
    "Fix: Supabase Dashboard -> Project Settings -> API Keys -> copy the "
    "'service_role' secret (legacy) or an 'sb_secret_...' key, and set it as "
    "SUPABASE_SERVICE_KEY in backend/.env AND in the deployed environment."
)


def describe_key(key: str) -> str:
    """
    Return the role a Supabase key grants: 'service_role', 'anon', 'unknown', …

    Supabase's legacy keys are unsigned-readable JWTs carrying a ``role`` claim;
    the newer ones are opaque and identify themselves by prefix. Knowing which
    one is configured is the difference between a working upload and an RLS
    rejection, so it is worth checking rather than guessing.
    """
    key = (key or "").strip().strip("'").strip('"')
    if not key:
        return "missing"
    if key in _PLACEHOLDER_KEYS:
        return "placeholder"
    if key.startswith("sb_secret_"):
        return "service_role"
    if key.startswith("sb_publishable_"):
        return "publishable"
    if key.count(".") == 2:
        try:
            payload = key.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            return json.loads(base64.urlsafe_b64decode(payload)).get("role", "unknown")
        except Exception:
            return "unknown"
    return "unknown"


def storage_config_error() -> Optional[str]:
    """
    Return a human-readable reason Supabase storage cannot work, or None if the
    configuration looks usable. Used both by uploads and at application startup
    so a bad key is reported before anyone tries to upload a document.
    """
    if not settings.SUPABASE_URL.strip():
        return "SUPABASE_URL is not set."
    role = describe_key(settings.SUPABASE_SERVICE_KEY)
    if role in ("missing", "placeholder"):
        return (
            "SUPABASE_SERVICE_KEY is not set. Add the service-role key from "
            "Supabase Dashboard -> Project Settings -> API Keys."
        )
    if role != "service_role":
        return _WRONG_KEY_MESSAGE.format(role=role)
    return None


def _get_client():
    global _supabase_client

    problem = storage_config_error()
    if problem:
        # 500, not 400 — the caller's request was fine; the server is misconfigured.
        logger.error("Supabase storage misconfigured: %s", problem)
        raise HTTPException(status_code=500, detail=problem)

    if _supabase_client is None:
        try:
            from supabase import create_client

            # Strip trailing/leading whitespace and quotes to prevent JWS errors
            url = settings.SUPABASE_URL.strip().strip("'").strip('"')
            key = settings.SUPABASE_SERVICE_KEY.strip().strip("'").strip('"')
            _supabase_client = create_client(url, key)
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="The 'supabase' python package is missing. Please ensure requirements.txt is updated.",
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
    base_name = original_filename.rsplit(".", 1)[0] if "." in original_filename else original_filename
    # Supabase rejects object keys containing characters outside its safe set, so
    # anything unusual in a customer's filename is collapsed to a hyphen. The
    # random suffix keeps the key unique regardless of what survives.
    safe_base = re.sub(r"[^A-Za-z0-9._-]+", "-", base_name).strip("-") or "file"
    safe_ext = re.sub(r"[^A-Za-z0-9]+", "", ext) or "pdf"
    unique_name = f"{safe_base[:80]}-{uuid.uuid4().hex[:8]}.{safe_ext}"
    path = f"{folder}/{unique_name}".lstrip("/") if folder else unique_name

    try:
        client.storage.from_(bucket).upload(
            path=path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "false"},
        )
    except Exception as exc:
        detail = str(exc)
        lowered = detail.lower()
        # Translate Supabase's generic errors into something that names the
        # actual fix, rather than leaving an RLS string in the API response.
        if "row-level security" in lowered or "accessdenied" in lowered:
            role = describe_key(settings.SUPABASE_SERVICE_KEY)
            raise HTTPException(status_code=500, detail=_WRONG_KEY_MESSAGE.format(role=role))
        if "not found" in lowered and "bucket" in lowered:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Supabase bucket '{bucket}' does not exist. Create it in "
                    "Supabase Dashboard -> Storage, or correct the bucket name in "
                    "backend/constants.py."
                ),
            )
        logger.exception("Supabase upload failed for bucket=%s path=%s", bucket, path)
        raise HTTPException(status_code=500, detail=f"File upload failed: {detail}")

    logger.info("Uploaded to Supabase storage: bucket=%s path=%s", bucket, path)
    return f"{settings.SUPABASE_URL.strip().rstrip('/')}/storage/v1/object/public/{bucket}/{path}"


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
