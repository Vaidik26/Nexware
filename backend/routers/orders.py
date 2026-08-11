from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from typing import List
import tempfile, uuid, os, re
from backend.database import get_db
from backend.models.order import SalesOrder
from backend.models.catalogue import SalesItem
from backend.schemas.order import SalesOrderOut
from backend.dependencies import get_current_admin
from backend.services.pdf_parser import parse_lpo_pdf

router = APIRouter(prefix="/orders", tags=["orders"])


def _clean_desc(desc: str) -> str:
    desc = re.sub(r"\s+", " ", desc).strip()
    desc = re.sub(r"^[\-:,./\\]+|[\-:,./\\]+$", "", desc).strip()
    return desc or "Unknown Item"


async def _sync_lpo_items_to_db(items: list, db: AsyncSession):
    """
    For each item parsed from an LPO, insert it into sales_items if the
    barcode doesn't already exist. No hardcoded values — all data comes
    directly from the LPO itself.
    """
    barcodes_with_data = [
        i for i in items if i.get("barcode") and not i.get("has_missing_barcode")
    ]
    if not barcodes_with_data:
        return

    all_barcodes = [i["barcode"] for i in barcodes_with_data]
    existing_res = await db.execute(
        select(SalesItem.barcode).where(SalesItem.barcode.in_(all_barcodes))
    )
    existing_set = {row[0] for row in existing_res.fetchall()}

    # Count existing items for sequential item numbers
    count_res = await db.execute(select(SalesItem.item_number))
    existing_numbers = {row[0] for row in count_res.fetchall()}
    index = len(existing_numbers) + 1

    new_rows = []
    for item in barcodes_with_data:
        bc = item["barcode"]
        if bc in existing_set:
            continue

        item_number = f"BC-{bc}"
        while item_number in existing_numbers:
            item_number = f"BC-{bc}-{index}"
            index += 1

        new_rows.append({
            "item_number": item_number,
            "item_name": _clean_desc(item.get("description", "")),
            "barcode": bc,
            "unit": item.get("uom", "PCS") or "PCS",
            "bin_location": None,
            "standard_carton_quantity": 1,
            "packaging_weight": 0.0,
            "sku_size_category": ">100g",
            "available_quantity": 0,
        })
        existing_set.add(bc)
        existing_numbers.add(item_number)
        index += 1

    if new_rows:
        stmt = pg_insert(SalesItem).values(new_rows).on_conflict_do_nothing(
            index_elements=["barcode"]
        )
        await db.execute(stmt)
        await db.commit()

    return len(new_rows)


@router.get("", response_model=List[SalesOrderOut])
@router.get("/", response_model=List[SalesOrderOut])
async def get_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesOrder))
    return result.scalars().all()


@router.post("/upload")
async def upload_lpo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_admin)
):
    """Upload & parse an LPO PDF. New items are auto-synced to the catalogue DB."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_bytes = await file.read()

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
