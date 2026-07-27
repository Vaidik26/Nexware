from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import date, timedelta
import io

from backend.database import get_db
from backend.models.market import RawMaterial, DubaiPrice, InternationalPrice
from backend.schemas.market import (
    RawMaterialCreate, RawMaterialUpdate, RawMaterialOut,
    DubaiPriceCreate, DubaiPriceOut,
    InternationalPriceCreate, InternationalPriceOut,
    PriceHistoryReportRequest
)
from backend.services.excel_service import generate_branded_price_history_excel
from backend.services.pdf_generator import generate_price_history_pdf
from backend.dependencies import get_current_admin
from sqlalchemy.exc import IntegrityError

router = APIRouter(prefix="/market", tags=["market"])


# ---------- Raw Materials ----------

@router.get("/materials", response_model=List[RawMaterialOut])
async def list_materials(
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
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
        
    # Safeguard: Prevent deletion if historical Dubai or International price records exist
    dubai_check = await db.execute(select(DubaiPrice).filter(DubaiPrice.material_id == material_id))
    intl_check = await db.execute(select(InternationalPrice).filter(InternationalPrice.material_id == material_id))
    if dubai_check.scalars().first() or intl_check.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="Cannot delete commodity: Historical Dubai or International price entries exist for this material. Deleting it would corrupt pricing analytics and violate audit logging rules."
        )

    await db.delete(db_mat)
    await db.commit()


# ---------- Dubai Prices ----------

@router.get("/dubai-prices", response_model=List[DubaiPriceOut])
async def list_dubai_prices(
    material_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db)
):
    q = select(DubaiPrice)
    if material_id:
        q = q.filter(DubaiPrice.material_id == material_id)
    if date_from:
        q = q.filter(DubaiPrice.date >= date_from)
    if date_to:
        q = q.filter(DubaiPrice.date <= date_to)
    result = await db.execute(q.order_by(desc(DubaiPrice.date)))
    return result.scalars().all()


@router.post("/dubai-prices", response_model=DubaiPriceOut, status_code=201)
async def create_dubai_price(
    price: DubaiPriceCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    if price.local_market_price <= 0:
        raise HTTPException(status_code=400, detail="Price must be > 0")
    
    result = await db.execute(
        select(DubaiPrice).filter(
            DubaiPrice.material_id == price.material_id,
            DubaiPrice.date == price.date
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.local_market_price = price.local_market_price
        await db.commit()
        await db.refresh(existing)
        return existing

    try:
        db_price = DubaiPrice(**price.model_dump())
        db.add(db_price)
        await db.commit()
        await db.refresh(db_price)
        return db_price
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Price entry already exists for this material and date")


@router.delete("/dubai-prices/{price_id}", status_code=204)
async def delete_dubai_price(
    price_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    result = await db.execute(select(DubaiPrice).filter(DubaiPrice.id == price_id))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Price record not found")
    await db.delete(record)
    await db.commit()


# ---------- International Prices ----------

@router.get("/international-prices", response_model=List[InternationalPriceOut])
async def list_international_prices(
    material_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db)
):
    q = select(InternationalPrice)
    if material_id:
        q = q.filter(InternationalPrice.material_id == material_id)
    if date_from:
        q = q.filter(InternationalPrice.date >= date_from)
    if date_to:
        q = q.filter(InternationalPrice.date <= date_to)
    result = await db.execute(q.order_by(desc(InternationalPrice.date)))
    return result.scalars().all()


@router.post("/international-prices", response_model=InternationalPriceOut, status_code=201)
async def create_international_price(
    price: InternationalPriceCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    if price.fob_price <= 0 or price.cif_price <= 0:
        raise HTTPException(status_code=400, detail="FOB and CIF must be > 0")
        
    result = await db.execute(
        select(InternationalPrice).filter(
            InternationalPrice.material_id == price.material_id,
            InternationalPrice.date == price.date
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.fob_price = price.fob_price
        existing.cif_price = price.cif_price
        await db.commit()
        await db.refresh(existing)
        return existing

    try:
        db_price = InternationalPrice(**price.model_dump())
        db.add(db_price)
        await db.commit()
        await db.refresh(db_price)
        return db_price
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Price entry already exists for this material and date")


@router.delete("/international-prices/{price_id}", status_code=204)
async def delete_international_price(
    price_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin)
):
    result = await db.execute(select(InternationalPrice).filter(InternationalPrice.id == price_id))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Price record not found")
    await db.delete(record)
    await db.commit()


# ---------- Dashboard Endpoints ----------

@router.get("/dashboard/stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    today = date.today()

    dubai_today = await db.execute(
        select(func.count(DubaiPrice.id)).filter(DubaiPrice.date == today)
    )
    intl_today = await db.execute(
        select(func.count(InternationalPrice.id)).filter(InternationalPrice.date == today)
    )
    materials_count = await db.execute(select(func.count(RawMaterial.id)))

    # Latest price change: compare last two Dubai entries for any material
    last_two = await db.execute(
        select(DubaiPrice).order_by(desc(DubaiPrice.date)).limit(2)
    )
    prices = last_two.scalars().all()
    price_change_pct = 0.0
    if len(prices) == 2 and prices[1].local_market_price > 0:
        price_change_pct = round(
            ((prices[0].local_market_price - prices[1].local_market_price) / prices[1].local_market_price) * 100,
            2
        )

    return {
        "dubai_entries_today": dubai_today.scalar(),
        "international_entries_today": intl_today.scalar(),
        "active_materials": materials_count.scalar(),
        "latest_price_change_pct": price_change_pct,
    }


@router.get("/prices/trend")
async def price_trend(
    range: str = Query("7d", regex="^(7d|30d|ytd)$"),
    db: AsyncSession = Depends(get_db)
):
    today = date.today()
    if range == "7d":
        start = today - timedelta(days=7)
    elif range == "30d":
        start = today - timedelta(days=30)
    else:
        start = date(today.year, 1, 1)

    dubai_q = await db.execute(
        select(DubaiPrice.date, func.avg(DubaiPrice.local_market_price).label("avg_price"))
        .filter(DubaiPrice.date >= start)
        .group_by(DubaiPrice.date)
        .order_by(DubaiPrice.date)
    )
    dubai_rows = dubai_q.fetchall()

    intl_q = await db.execute(
        select(
            InternationalPrice.date,
            func.avg(InternationalPrice.fob_price).label("avg_fob"),
            func.avg(InternationalPrice.cif_price).label("avg_cif"),
        )
        .filter(InternationalPrice.date >= start)
        .group_by(InternationalPrice.date)
        .order_by(InternationalPrice.date)
    )
    intl_rows = intl_q.fetchall()

    return {
        "range": range,
        "dubai": [{"date": str(r.date), "avg_price": round(r.avg_price, 2)} for r in dubai_rows],
        "international": [
            {"date": str(r.date), "avg_fob": round(r.avg_fob, 2), "avg_cif": round(r.avg_cif, 2)}
            for r in intl_rows
        ],
    }


@router.get("/prices/recent-updates")
async def recent_updates(limit: int = 10, db: AsyncSession = Depends(get_db)):
    materials = await db.execute(select(RawMaterial).order_by(RawMaterial.id).limit(limit))
    mats = materials.scalars().all()

    rows = []
    for mat in mats:
        last_dubai = await db.execute(
            select(DubaiPrice)
            .filter(DubaiPrice.material_id == mat.id)
            .order_by(desc(DubaiPrice.date))
            .limit(2)
        )
        dubai_prices = last_dubai.scalars().all()

        last_intl = await db.execute(
            select(InternationalPrice)
            .filter(InternationalPrice.material_id == mat.id)
            .order_by(desc(InternationalPrice.date))
            .limit(1)
        )
        intl = last_intl.scalars().first()

        dubai_change = 0.0
        last_dubai_price = None
        updated_at = None
        if dubai_prices:
            last_dubai_price = dubai_prices[0].local_market_price
            updated_at = str(dubai_prices[0].date)
            if len(dubai_prices) == 2 and dubai_prices[1].local_market_price > 0:
                dubai_change = round(
                    ((dubai_prices[0].local_market_price - dubai_prices[1].local_market_price)
                     / dubai_prices[1].local_market_price) * 100, 2
                )

        rows.append({
            "material_id": mat.id,
            "material_code": mat.material_code,
            "material_name": mat.material_name,
            "last_dubai_price": last_dubai_price,
            "last_cif": intl.cif_price if intl else None,
            "updated_at": updated_at,
            "change_pct": dubai_change,
        })

    rows.sort(key=lambda x: x["updated_at"] or "", reverse=True)
    return rows


@router.get("/prices/summary")
async def price_summary(db: AsyncSession = Depends(get_db)):
    avg_dubai = await db.execute(select(func.avg(DubaiPrice.local_market_price)))
    avg_fob = await db.execute(select(func.avg(InternationalPrice.fob_price)))
    avg_cif = await db.execute(select(func.avg(InternationalPrice.cif_price)))

    return {
        "avg_dubai_price": round(avg_dubai.scalar() or 0, 2),
        "avg_fob": round(avg_fob.scalar() or 0, 2),
        "avg_cif": round(avg_cif.scalar() or 0, 2),
    }


@router.get("/prices/latest-changes")
async def latest_price_changes(limit: int = 8, db: AsyncSession = Depends(get_db)):
    last_dubai = await db.execute(
        select(DubaiPrice, RawMaterial)
        .join(RawMaterial, DubaiPrice.material_id == RawMaterial.id)
        .order_by(desc(DubaiPrice.created_at))
        .limit(limit * 2)
    )
    rows = last_dubai.fetchall()

    seen = {}
    result = []
    for price, mat in rows:
        if mat.id not in seen:
            seen[mat.id] = {"price": price, "mat": mat}
        elif len(seen[mat.id]) == 2:
            pass
        else:
            prev = seen[mat.id]["price"]
            change = 0.0
            if prev.local_market_price > 0:
                change = round(
                    ((price.local_market_price - prev.local_market_price) / prev.local_market_price) * 100, 2
                )
            result.append({
                "material_name": mat.material_name,
                "material_code": mat.material_code,
                "current_price": price.local_market_price,
                "previous_price": prev.local_market_price,
                "change_pct": change,
                "date": str(price.date),
            })
        if len(result) >= limit:
            break

    return result


@router.post("/prices/export-excel")
async def export_price_history_excel(request: PriceHistoryReportRequest):
    excel_bytes = generate_branded_price_history_excel(request.model_dump())
    filename = f"NexWare_Commodity_Price_Report_{request.scope.lower()}.xlsx"
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/prices/export-pdf")
async def export_price_history_pdf(request: PriceHistoryReportRequest):
    pdf_bytes = generate_price_history_pdf(request.model_dump())
    filename = f"NexWare_Commodity_Price_Report_{request.scope.lower()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    ) # Final export endpoints included

