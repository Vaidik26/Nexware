from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
import os
import uuid
from backend.database import get_db
from backend.models.order import SalesOrder
from backend.schemas.order import SalesOrderOut
from backend.dependencies import get_current_admin
from backend.services.pdf_parser import parse_lpo_pdf

router = APIRouter(prefix="/orders", tags=["orders"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/", response_model=List[SalesOrderOut])
async def get_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesOrder))
    return result.scalars().all()

@router.post("/upload")
async def upload_lpo(file: UploadFile = File(...), current_user = Depends(get_current_admin)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
    file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename}")
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
        
    try:
        extracted_data = parse_lpo_pdf(file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
    finally:
        # Clean up temporary uploaded file from disk after parsing
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        
    if not extracted_data.get("items"):
        raise HTTPException(status_code=400, detail="No barcodes could be extracted from this document.")
        
    # Return extracted barcode structure directly without saving anything into the DB!
    return {
        "id": None,
        "filename": file.filename,
        "extracted_data": extracted_data,
        "status": "extracted"
    }
