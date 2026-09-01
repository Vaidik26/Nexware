"""
Sales order upload router.

Handles the PDF ingestion pipeline: a customer's order document is uploaded,
parsed by ``pdf_parser``, and the extracted lines are later turned into a
picklist by ``/picklists/generate/{order_id}``.
"""
import logging
import os
import tempfile
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from sqlalchemy.future import select

from backend.constants import (
    ALLOWED_PDF_MIME_TYPES,
    BUCKET_CUSTOMER_CONFIRMATION,
    FOLDER_CUSTOMER_SIGNED,
    MAX_UPLOAD_SIZE_BYTES,
    MAX_UPLOAD_SIZE_MB,
)
from backend.database import get_db
from backend.dependencies import get_current_admin
from backend.models.order import SalesOrder
from backend.schemas.order import SalesOrderOut
from backend.services.pdf_parser import parse_lpo_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=List[SalesOrderOut])
@router.get("/", response_model=List[SalesOrderOut])
async def get_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesOrder))
    return result.scalars().all()


@router.post("/upload")
async def upload_lpo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Upload & parse an LPO PDF. New items are auto-synced to the catalogue DB."""
    # ── File validation ────────────────────────────────────────────────────────
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_PDF_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are allowed. Received: " + (content_type or "unknown"),
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum upload size of {MAX_UPLOAD_SIZE_MB} MB.",
        )

    tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_{file.filename}")
    try:
        with open(tmp_path, "wb") as f:
            f.write(file_bytes)
        # Parsing is CPU-bound and synchronous. Run it off the event loop so a
        # large document does not stall every other in-flight request.
        extracted_data = await run_in_threadpool(parse_lpo_pdf, tmp_path)
    except Exception as exc:
        logger.exception("PDF parsing failed for file '%s': %s", file.filename, exc)
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(exc)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception as exc:
                logger.warning("Could not delete temp file %s: %s", tmp_path, exc)

    if not extracted_data.get("items"):
        raise HTTPException(
            status_code=400,
            detail="No barcodes could be extracted from this document."
        )

    return {
        "id": None,
        "filename": file.filename,
        "extracted_data": extracted_data,
        "new_catalogue_items_added": 0,
        "status": "extracted"
    }


@router.post("/upload-signed-lpo")
async def upload_signed_lpo(
    file: UploadFile = File(...),
    current_user = Depends(get_current_admin)
):
    """
    Upload a customer-signed LPO PDF to Supabase Storage bucket 'Customer Confirmation'.
    Returns the public URL where the file is stored.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_bytes = await file.read()

    try:
        from backend.services.storage_service import upload_to_supabase
        # run_in_threadpool: the Supabase SDK uses a synchronous HTTP client, and
        # calling it directly from an async endpoint blocks the event loop for the
        # whole upload — freezing every other request on the server while one
        # picker's PDF goes up. Offloading it keeps the API responsive.
        public_url = await run_in_threadpool(
            upload_to_supabase,
            file_bytes=file_bytes,
            original_filename=file.filename,
            bucket=BUCKET_CUSTOMER_CONFIRMATION,
            folder=FOLDER_CUSTOMER_SIGNED,
            content_type="application/pdf",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload to Supabase failed: {str(e)}")

    return {
        "filename": file.filename,
        "url": public_url,
        "bucket": BUCKET_CUSTOMER_CONFIRMATION,
        "folder": FOLDER_CUSTOMER_SIGNED,
    }
