from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
import tempfile, uuid, os
from backend.database import get_db
from backend.models.order import SalesOrder
from backend.schemas.order import SalesOrderOut
from backend.dependencies import get_current_admin
from backend.services.pdf_parser import parse_lpo_pdf

router = APIRouter(prefix="/orders", tags=["orders"])

@router.get("", response_model=List[SalesOrderOut])
@router.get("/", response_model=List[SalesOrderOut])
async def get_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesOrder))
    return result.scalars().all()


@router.post("/upload")
async def upload_lpo(
    file: UploadFile = File(...),
    current_user = Depends(get_current_admin)
):
    """Upload & parse an LPO PDF. File is stored temporarily, parsed, then discarded."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_bytes = await file.read()

    # Write to a temporary file for parsing
    tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_{file.filename}")
    try:
        with open(tmp_path, "wb") as f:
            f.write(file_bytes)
        extracted_data = parse_lpo_pdf(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if not extracted_data.get("items"):
        raise HTTPException(
            status_code=400,
            detail="No barcodes could be extracted from this document."
        )

    return {
        "id": None,
        "filename": file.filename,
        "extracted_data": extracted_data,
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
        public_url = upload_to_supabase(
            file_bytes=file_bytes,
            original_filename=file.filename,
            bucket="Customer Confirmation",
            folder="Customer-Signed",
            content_type="application/pdf",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload to Supabase failed: {str(e)}")

    return {
        "filename": file.filename,
        "url": public_url,
        "bucket": "Customer Confirmation",
        "folder": "Customer-Signed",
    }
