import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc, and_
from typing import List, Optional
from datetime import date, timedelta
import io

from backend.database import get_db
from backend.models.market import RawMaterial, MarketPrice
from backend.schemas.market import (
    RawMaterialCreate, RawMaterialUpdate, RawMaterialOut,
    MarketPriceCreate, MarketPriceOut,
    PriceHistoryReportRequest
)
from backend.services.excel_service import generate_branded_price_history_excel
from backend.services.pdf_generator import generate_price_history_pdf
from backend.dependencies import get_current_admin, get_current_user
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])


# ---------- Raw Materials ----------

@router.get("/materials", response_model=List[RawMaterialOut])
async def list_materials(
    search: Optional[str] = None,
    category: Optional[str] = None,
    market_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(RawMaterial)
    if search:
        q = q.filter(RawMaterial.material_name.ilike(f"%{search}%"))
    if category:
        q = q.filter(RawMaterial.category == category)
    if market_type:
        q = q.filter(RawMaterial.market_type == market_type)
    result = await db.execute(q.order_by(RawMaterial.id))
    return result.scalars().all()


@router.post("/materials", response_model=RawMaterialOut, status_code=201)
async def create_material(
    material: RawMaterialCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    if material.bag_carton_weight <= 0:
        raise HTTPException(status_code=400, detail="Weight must be > 0")
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
        
    price_check = await db.execute(select(MarketPrice).filter(MarketPrice.material_id == material_id))
    if price_check.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="Cannot delete commodity: Historical price entries exist for this material."
        )

    await db.delete(db_mat)
    await db.commit()


# ---------- Market Prices ----------

@router.get("/prices", response_model=List[MarketPriceOut])
async def list_prices(
    material_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    market: Optional[str] = None,
    price_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(MarketPrice)
    if material_id:
        q = q.filter(MarketPrice.material_id == material_id)
    if date_from:
        q = q.filter(MarketPrice.date >= date_from)
    if date_to:
        q = q.filter(MarketPrice.date <= date_to)
    if market:
        q = q.filter(MarketPrice.market == market)
    if price_type:
        q = q.filter(MarketPrice.price_type == price_type)
    result = await db.execute(q.order_by(desc(MarketPrice.date)))
    return result.scalars().all()


@router.post("/prices", response_model=MarketPriceOut, status_code=201)
async def create_price(
    price: MarketPriceCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if price.price <= 0:
        raise HTTPException(status_code=400, detail="Price must be > 0")
    
    result = await db.execute(
        select(MarketPrice).filter(
            MarketPrice.material_id == price.material_id,
            MarketPrice.date == price.date,
            MarketPrice.market == price.market,
            MarketPrice.price_type == price.price_type
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.price = price.price
        existing.currency = price.currency
        await db.commit()
        await db.refresh(existing)
        return existing

    try:
        db_price = MarketPrice(**price.model_dump())
        db.add(db_price)
        await db.commit()
        await db.refresh(db_price)
        return db_price
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Price entry already exists for this date and type")


@router.delete("/prices/{price_id}", status_code=204)
async def delete_price(
    price_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    result = await db.execute(select(MarketPrice).filter(MarketPrice.id == price_id))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Price record not found")
    await db.delete(record)
    await db.commit()


# ---------- Dashboard Endpoints ----------

@router.get("/dashboard/stats")
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    today = date.today()
    prices_today = await db.execute(
        select(func.count(MarketPrice.id)).filter(MarketPrice.date == today)
    )
    materials_count = await db.execute(select(func.count(RawMaterial.id)))
    return {
        "dubai_entries_today": 0,
        "international_entries_today": 0,
        "entries_today": prices_today.scalar(),
        "active_materials": materials_count.scalar(),
        "latest_price_change_pct": 0,
    }


@router.get("/prices/recent-updates")
async def recent_updates(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    materials = await db.execute(select(RawMaterial).order_by(RawMaterial.id).limit(limit))
    mats = materials.scalars().all()

    rows = []
    for mat in mats:
        last_prices_q = await db.execute(
            select(MarketPrice)
            .filter(MarketPrice.material_id == mat.id)
            .order_by(desc(MarketPrice.date))
            .limit(1)
        )
        last_price = last_prices_q.scalars().first()

        rows.append({
            "material_id": mat.id,
            "material_code": mat.material_code,
            "material_name": mat.material_name,
            "category": mat.category,
            "market_type": mat.market_type,
            "last_price": last_price.price if last_price else None,
            "last_currency": last_price.currency if last_price else None,
            "last_market": last_price.market if last_price else None,
            "last_type": last_price.price_type if last_price else None,
            "updated_at": str(last_price.date) if last_price else None,
        })

    rows.sort(key=lambda x: x["updated_at"] or "", reverse=True)
    return rows

@router.post("/prices/export-excel")
async def export_price_history_excel(
    request: PriceHistoryReportRequest,
    current_user=Depends(get_current_user),
):
    return {"message": "Export disabled temporarily"}

@router.post("/prices/export-pdf")
async def export_price_history_pdf(
    request: PriceHistoryReportRequest,
    current_user=Depends(get_current_user),
):
    return {"message": "Export disabled temporarily"}
