from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func as sqlfunc
from typing import List
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any
from backend.database import get_db
from backend.models.lpo import Lpo
from backend.models.user import User, Notification
from backend.models.picklist import PickList, PickListItem
from backend.models.catalogue import SalesItem
import httpx


router = APIRouter(prefix="/lpos", tags=["lpos"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LpoItemSchema(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str

class LpoCreate(BaseModel):
    lpo_number: str
    customer_name: str
    items: List[LpoItemSchema]
    sales_person_id: Optional[int] = None   # optional — manual/admin orders may not have one
    delivery_date: Optional[datetime] = None
    source: Optional[str] = "upload"        # 'upload' | 'manual' | 'mobile'

class LpoUpdateStatus(BaseModel):
    status: str

class ApproveRequest(BaseModel):
    assign_mode: str            # 'auto' | 'manual'
    picker_id: Optional[int] = None   # required when assign_mode == 'manual'

class LpoOut(BaseModel):
    id: int
    lpo_number: str
    customer_name: str
    sales_person_id: Optional[int]
    items: Any
    signed_lpo_url: Optional[str]
    status: str
    source: Optional[str] = "upload"
    delivery_date: Optional[datetime] = None
    created_at: Optional[Any] = None

    class Config:
        from_attributes = True


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _send_push_sync(push_token: str, title: str, body: str):
    if not push_token:
        return
    try:
        with httpx.Client(timeout=1.0) as client:
            client.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": push_token, "title": title, "body": body},
            )
    except Exception:
        pass


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=List[LpoOut])
@router.get("/", response_model=List[LpoOut])
async def get_lpos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).order_by(Lpo.created_at.desc()))
    return result.scalars().all()


@router.get("/{lpo_id}", response_model=LpoOut)
async def get_lpo_by_id(lpo_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
    return lpo


@router.post("", response_model=LpoOut)
@router.post("/", response_model=LpoOut)
async def create_lpo(lpo: LpoCreate, db: AsyncSession = Depends(get_db)):
    # Auto-generate unique LPO number if duplicate exists
    lpo_number = lpo.lpo_number
    exists = await db.execute(select(Lpo).filter(Lpo.lpo_number == lpo_number))
    if exists.scalar_one_or_none():
        from datetime import datetime
        suffix = datetime.utcnow().strftime("%H%M%S")
        lpo_number = f"{lpo_number}-{suffix}"

    db_lpo = Lpo(
        lpo_number=lpo_number,
        customer_name=lpo.customer_name,
        sales_person_id=lpo.sales_person_id,
        items=[item.dict() for item in lpo.items],
        delivery_date=lpo.delivery_date,
        status="pending",
        source=lpo.source or "upload",
    )
    db.add(db_lpo)
    await db.commit()
    await db.refresh(db_lpo)
    return db_lpo


@router.patch("/{lpo_id}/url", response_model=LpoOut)
async def update_lpo_url(lpo_id: int, url: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    lpo.signed_lpo_url = url
    await db.commit()
    await db.refresh(lpo)
    return lpo


@router.patch("/{lpo_id}/status", response_model=LpoOut)
async def update_lpo_status(lpo_id: int, status_update: LpoUpdateStatus, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    lpo.status = status_update.status
    await db.commit()
    await db.refresh(lpo)
    return lpo


@router.post("/{lpo_id}/disapprove", response_model=LpoOut)
async def disapprove_lpo(lpo_id: int, db: AsyncSession = Depends(get_db)):
    """Mark an LPO as disapproved by the warehouse manager."""
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
    if lpo.status == "processed":
        raise HTTPException(status_code=400, detail="Cannot disapprove a processed LPO")

    lpo.status = "disapproved"
    await db.commit()
    await db.refresh(lpo)
    return lpo


@router.post("/{lpo_id}/approve")
async def approve_lpo(
    lpo_id: int,
    req: ApproveRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve an LPO and immediately convert it into a picklist.
    assign_mode = 'auto' → round-robin assign to least-loaded picker.
    assign_mode = 'manual' → assign to specific picker_id.
    """
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
    if lpo.status == "processed":
        raise HTTPException(status_code=400, detail="LPO is already converted")

    # ── Create picklist ──────────────────────────────────────────────────────
    db_picklist = PickList(
        order_number=lpo.lpo_number,
        customer_name=lpo.customer_name,
        sales_person_id=lpo.sales_person_id,
        sales_order_id=None,
        status="draft",
        picker_job_number=None,
        delivery_date=lpo.delivery_date,
    )
    db.add(db_picklist)
    await db.flush()

    all_barcodes = [item.get("barcode", "N/A") for item in lpo.items]
    cat_res = await db.execute(select(SalesItem).filter(SalesItem.barcode.in_(all_barcodes)))
    cat_map = {ci.barcode: ci for ci in cat_res.scalars().all()}

    for item in lpo.items:
        bc = item.get("barcode", "N/A")
        cat_item = cat_map.get(bc)
        db.add(PickListItem(
            pick_list_id=db_picklist.id,
            barcode=bc,
            product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
            quantity=item.get("quantity", 1),
            unit=item.get("unit", "PCS"),
            bin_location=cat_item.bin_location if cat_item else None,
        ))

    # ── Assign picker ────────────────────────────────────────────────────────
    picker = None
    if req.assign_mode == "manual":
        if not req.picker_id:
            raise HTTPException(status_code=400, detail="picker_id required for manual assign")
        p_res = await db.execute(select(User).filter(User.id == req.picker_id, User.role == "picker"))
        picker = p_res.scalar_one_or_none()
        if not picker:
            raise HTTPException(status_code=404, detail="Picker not found")
    else:
        # Auto: find picker with fewest active picklists
        from sqlalchemy import func as sa_func
        pickers_res = await db.execute(select(User).filter(User.role == "picker", User.is_active == True))
        all_pickers = pickers_res.scalars().all()
        if not all_pickers:
            raise HTTPException(status_code=404, detail="No active pickers available for auto-assign")
        # Round-robin: pick the one with fewest non-completed picklists
        best = None
        best_count = 999999
        for p in all_pickers:
            cnt_res = await db.execute(
                select(sa_func.count(PickList.id)).filter(
                    PickList.picker_job_number == str(p.id),
                    PickList.status.notin_(["completed", "cancelled"])
                )
            )
            cnt = cnt_res.scalar() or 0
            if cnt < best_count:
                best_count = cnt
                best = p
        picker = best

    if picker:
        db_picklist.picker_job_number = str(picker.id)
        db_picklist.status = "assigned"
        # Notify picker
        notif = Notification(
            user_id=picker.id,
            title="New Picklist Assigned",
            message=f"LPO #{lpo.lpo_number} for {lpo.customer_name} has been approved and assigned to you.",
        )
        db.add(notif)
        if picker.push_token:
            background_tasks.add_task(
                _send_push_sync,
                picker.push_token,
                "New Picklist Assigned",
                f"LPO #{lpo.lpo_number} assigned to you.",
            )

    lpo.status = "processed"
    await db.commit()
    await db.refresh(db_picklist)

    return {
        "message": "LPO approved and converted to picklist",
        "picklist_id": db_picklist.id,
        "assigned_to": picker.full_name if picker else None,
        "items_count": len(lpo.items),
    }


@router.delete("/{lpo_id}")
async def delete_lpo(lpo_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    await db.delete(lpo)
    await db.commit()
    return {"message": "LPO deleted successfully"}


# Keep the old convert endpoint for backward compatibility
@router.post("/{lpo_id}/convert")
async def convert_lpo_to_picklist(lpo_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    if lpo.status == "processed":
        raise HTTPException(status_code=400, detail="LPO is already converted")

    db_picklist = PickList(
        order_number=lpo.lpo_number,
        customer_name=lpo.customer_name,
        sales_person_id=lpo.sales_person_id,
        sales_order_id=None,
        status="draft",
        picker_job_number=None,
        delivery_date=lpo.delivery_date,
    )
    db.add(db_picklist)
    await db.flush()

    all_barcodes = [item.get("barcode", "N/A") for item in lpo.items]
    cat_res = await db.execute(select(SalesItem).filter(SalesItem.barcode.in_(all_barcodes)))
    cat_map = {ci.barcode: ci for ci in cat_res.scalars().all()}

    verified_count = 0
    for item in lpo.items:
        bc = item.get("barcode", "N/A")
        cat_item = cat_map.get(bc)
        db.add(PickListItem(
            pick_list_id=db_picklist.id,
            barcode=bc,
            product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
            quantity=item.get("quantity", 1),
            unit=item.get("unit", "EA"),
            bin_location=cat_item.bin_location if cat_item else None,
        ))
        verified_count += 1

    lpo.status = "processed"
    await db.commit()
    await db.refresh(db_picklist)

    return {
        "message": "LPO converted to pick list successfully",
        "picklist_id": db_picklist.id,
        "items_count": verified_count,
    }
