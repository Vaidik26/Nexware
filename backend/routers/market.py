import logging
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import date, timedelta
import io

from backend.database import get_db
from backend.models.market import RawMaterial, CapturedPrice
from backend.schemas.market import (
    RawMaterialCreate, RawMaterialUpdate, RawMaterialOut,
    CapturedPriceCreate, CapturedPriceOut,
    PriceHistoryReportRequest
)
from backend.services.import_service import process_market_import, TemplateValidationError
from backend.services.excel_service import generate_branded_price_history_excel, generate_price_capture_template
from backend.services.pdf_generator import generate_price_history_pdf
from backend.dependencies import get_current_admin, get_current_user
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])


# ---------- Raw Materials ----------

@router.get("/materials", response_model=List[RawMaterialOut])
async def list_materials(
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),  # AUTH REQUIRED — pricing data is sensitive
):
    q = select(RawMaterial)
    if search:
        q = q.filter(RawMaterial.material_name.ilike(f"%{search}%"))
    result = await db.execute(q.order_by(RawMaterial.id))
    return result.scalars().all()


@router.post("/materials", response_model=RawMaterialOut, status_code=201)
async def create_material(
    material: RawMaterialCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    
    try:
        db_mat = RawMaterial(**material.model_dump())
        db.add(db_mat)
        await db.commit()
        await db.refresh(db_mat)
        return db_mat
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Material code already exists")


@router.put("/materials/{material_id}", response_model=RawMaterialOut)
async def update_material(
    material_id: int,
    material: RawMaterialCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    result = await db.execute(select(RawMaterial).filter(RawMaterial.id == material_id))
    db_mat = result.scalars().first()
    if not db_mat:
        raise HTTPException(status_code=404, detail="Material not found")
    for field, value in material.model_dump().items():
        setattr(db_mat, field, value)
    
    try:
        await db.commit()
        await db.refresh(db_mat)
        return db_mat
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Material code already exists on another commodity")


@router.delete("/materials/{material_id}", status_code=204)
async def delete_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    result = await db.execute(select(RawMaterial).filter(RawMaterial.id == material_id))
    db_mat = result.scalars().first()
    if not db_mat:
        raise HTTPException(status_code=404, detail="Material not found")
        
    # Safeguard: Prevent deletion if historical Dubai or International price records exist
    check = await db.execute(select(CapturedPrice).filter(CapturedPrice.material_id == material_id))
    if check.scalars().first():
        raise HTTPException(status_code=400, detail="Cannot delete commodity: Historical price entries exist.")


    await db.delete(db_mat)
    await db.commit()


# ---------- Captured Prices ----------

@router.get("/prices", response_model=List[CapturedPriceOut])
async def list_prices(
    material_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(CapturedPrice)
    if material_id:
        q = q.filter(CapturedPrice.material_id == material_id)
    if date_from:
        q = q.filter(CapturedPrice.date >= date_from)
    if date_to:
        q = q.filter(CapturedPrice.date <= date_to)
    result = await db.execute(q.order_by(desc(CapturedPrice.date)))
    return result.scalars().all()

@router.post("/prices", response_model=CapturedPriceOut, status_code=201)
async def create_price(
    price: CapturedPriceCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    result = await db.execute(
        select(CapturedPrice).filter(
            CapturedPrice.material_id == price.material_id,
            CapturedPrice.date == price.date
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.local_price_aed = price.local_price_aed
        existing.local_price_omr = price.local_price_omr
        existing.supplier_dubai = price.supplier_dubai
        existing.supplier_oman = price.supplier_oman
        existing.supplier_int = price.supplier_int
        existing.fob_price = price.fob_price
        existing.cif_price = price.cif_price
        await db.commit()
        await db.refresh(existing)
        return existing

    try:
        db_price = CapturedPrice(**price.model_dump())
        db.add(db_price)
        await db.commit()
        await db.refresh(db_price)
        return db_price
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Price entry already exists for this material and date")

@router.delete("/prices/{price_id}", status_code=204)
async def delete_price(
    price_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    result = await db.execute(select(CapturedPrice).filter(CapturedPrice.id == price_id))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Price record not found")
    await db.delete(record)
    await db.commit()

@router.get("/prices/latest")
async def get_latest_prices(
    date_target: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    target = date_target or date.today()
    
    # 1. Fetch all materials
    materials_result = await db.execute(select(RawMaterial).order_by(RawMaterial.id))
    materials = materials_result.scalars().all()
    
    # 2. Fetch all target prices for the given date in one query
    target_prices_result = await db.execute(
        select(CapturedPrice).filter(CapturedPrice.date == target)
    )
    target_prices_map = {p.material_id: p for p in target_prices_result.scalars().all()}
    
    # 3. Fetch the latest price before the target date for all materials using a subquery
    subq = select(
        CapturedPrice.material_id, 
        func.max(CapturedPrice.date).label('max_date')
    ).filter(CapturedPrice.date < target).group_by(CapturedPrice.material_id).subquery()
    
    last_prices_result = await db.execute(
        select(CapturedPrice).join(
            subq, 
            (CapturedPrice.material_id == subq.c.material_id) & (CapturedPrice.date == subq.c.max_date)
        )
    )
    last_prices_map = {p.material_id: p for p in last_prices_result.scalars().all()}
    
    res = []
    for mat in materials:
        target_price = target_prices_map.get(mat.id)
        last_price = last_prices_map.get(mat.id)
        
        res.append({
            "material": {
                "id": mat.id,
                "material_code": mat.material_code,
                "material_name": mat.material_name,
                "bag_carton_weight": mat.bag_carton_weight,
                "weight_unit": mat.weight_unit,
                "category": mat.category,
                "market_type": mat.market_type
            },
            "target_price": target_price,
            "last_price": last_price
        })
        
    return res


@router.post("/prices/export-excel")
async def export_price_history_excel(
    request: PriceHistoryReportRequest,
    current_user=Depends(get_current_user),  # AUTH REQUIRED
):
    excel_bytes = generate_branded_price_history_excel(request.model_dump())
    filename = f"NexWare_Commodity_Price_Report_{request.scope.lower()}.xlsx"
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/prices/export-pdf")
async def export_price_history_pdf(
    request: PriceHistoryReportRequest,
    current_user=Depends(get_current_user),  # AUTH REQUIRED
):
    pdf_bytes = generate_price_history_pdf(request.model_dump())
    filename = f"NexWare_Commodity_Price_Report_{request.scope.lower()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    ) # Final export endpoints included


@router.get("/prices/export-capture-template")
async def export_price_capture_template(
    market: str = Query("ALL", description="DXB, INT, BOTH, or ALL"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    materials_result = await db.execute(select(RawMaterial).order_by(RawMaterial.id))
    materials = materials_result.scalars().all()
    
    excel_bytes = generate_price_capture_template(materials, market)
    
    filename = f"Price_Capture_Template_{market}.xlsx"
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )



from fastapi import UploadFile, File, HTTPException
from backend.services.import_service import parse_price_import_excel, TemplateValidationError
import asyncio

@router.post("/prices/import-excel")
async def import_price_excel(
    date_target: date,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # 1. Read file and parse
    try:
        content = await file.read()
        parsed_data = parse_price_import_excel(content)
    except TemplateValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process Excel file: {str(e)}")

    valid_records = parsed_data["valid_records"]
    errors = parsed_data["errors"]
    
    if not valid_records:
        return {
            "success_count": 0,
            "skipped_count": len(errors),
            "errors": errors,
            "message": "No valid records found to import."
        }

    # Fetch materials map by SKU
    skus = list({r["sku"] for r in valid_records})
    materials_res = await db.execute(select(RawMaterial).filter(RawMaterial.material_code.in_(skus)))
    material_map = {m.material_code: m.id for m in materials_res.scalars().all()}
    
    # Check for SKUs that don't exist in DB
    valid_updates = []
    for r in valid_records:
        sku = r["sku"]
        if sku not in material_map:
            errors.append({"sheet": r["sheet"], "row": r["row"], "sku": sku, "reason": "SKU not found in the database."})
        else:
            r["material_id"] = material_map[sku]
            valid_updates.append(r)

    success_count = 0

    try:
        # Wrap DB operations in a transaction
        async with db.begin_nested():
            # Get existing records for this date
            mat_ids = [r["material_id"] for r in valid_updates]
            existing_res = await db.execute(
                select(CapturedPrice)
                .filter(CapturedPrice.date == date_target)
                .filter(CapturedPrice.material_id.in_(mat_ids))
            )
            existing_map = {p.material_id: p for p in existing_res.scalars().all()}

            for r in valid_updates:
                mat_id = r["material_id"]
                
                # Check for cancellation/disconnect
                await asyncio.sleep(0) # yield control to allow cancellation exception to bubble up if client disconnected

                if mat_id in existing_map:
                    # Update existing
                    record = existing_map[mat_id]
                    if "local_price_aed" in r: record.local_price_aed = r["local_price_aed"]
                    if "local_price_omr" in r: record.local_price_omr = r["local_price_omr"]
                    if "supplier_dubai" in r: record.supplier_dubai = r["supplier_dubai"]
                    if "supplier_oman" in r: record.supplier_oman = r["supplier_oman"]
                    if "cif_price" in r: record.cif_price = r["cif_price"]
                    if "fob_price" in r: record.fob_price = r["fob_price"]
                    if "supplier_int" in r: record.supplier_int = r["supplier_int"]
                else:
                    # Create new
                    new_record = CapturedPrice(
                        material_id=mat_id,
                        date=date_target,
                        local_price_aed=r.get("local_price_aed"),
                        local_price_omr=r.get("local_price_omr"),
                        supplier_dubai=r.get("supplier_dubai"),
                        supplier_oman=r.get("supplier_oman"),
                        cif_price=r.get("cif_price"),
                        fob_price=r.get("fob_price"),
                        supplier_int=r.get("supplier_int")
                    )
                    db.add(new_record)
                
                success_count += 1
            
            await db.commit()
    except asyncio.CancelledError:
        # User disconnected / aborted
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")

    return {
        "success_count": success_count,
        "skipped_count": len(errors),
        "errors": errors,
        "message": f"Successfully updated {success_count} records."
    }

@router.post("/prices/import-excel")
async def import_price_capture_excel(
    date_target: date,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file type. Only Excel files are supported.")
        
    try:
        file_bytes = await file.read()
        
        async with db.begin_nested() as transaction:
            summary = await process_market_import(file_bytes, date_target, db)
                
        await db.commit()
        return summary
    except TemplateValidationError as te:
        raise HTTPException(status_code=400, detail=str(te))
    except Exception as e:
        import traceback
        logging.error("Import error: %s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
