import logging
import asyncio
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.config import settings
from backend.constants import ACTIVE_PICK_STATUSES, DEFAULT_UNIT, WEIGHT_TOLERANCE_FRACTION
from backend.database import get_db
from backend.dependencies import get_current_admin, get_current_user
from backend.models.catalogue import CartonType, SalesItem
from backend.models.order import SalesOrder
from backend.models.picklist import PickAssignment, PickList, PickListBox, PickListBoxItem, PickListItem
from backend.models.user import Notification, User
from backend.schemas.picklist import PickListBoxCreate, PickListBoxOut, PickListOut, SealBoxCreate
from backend.services.excel_service import generate_branded_picklist_excel, generate_picklist_excel
from backend.services.notification_service import send_push_notification
from backend.services.pdf_generator import generate_picklist_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/picklists", tags=["picklists"])


# ─── Inline schemas not yet in schemas package ────────────────────────────────

class DirectAssignItem(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str = DEFAULT_UNIT


class DirectAssignRequest(BaseModel):
    order_number: str
    customer_name: str
    items: List[DirectAssignItem]
    auto_assign: bool = True
    sales_person_id: Optional[int] = None
    delivery_date: Optional[datetime] = None


def trigger_push(
    push_token: str,
    title: str,
    body: str,
    background_tasks: Optional[BackgroundTasks] = None,
) -> None:
    """Schedule a push notification via BackgroundTasks (preferred) or thread executor."""
    if not push_token:
        return
    if background_tasks is not None:
        background_tasks.add_task(send_push_notification, push_token, title, body)
    else:
        try:
            loop = asyncio.get_running_loop()
            loop.run_in_executor(None, send_push_notification, push_token, title, body)
        except Exception as exc:
            logger.warning("Could not schedule push notification: %s", exc)

@router.get("", response_model=List[PickListOut])
@router.get("/", response_model=List[PickListOut])
async def list_picklists(
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    q = select(PickList).options(
        selectinload(PickList.items),
        selectinload(PickList.boxes),
        selectinload(PickList.assignments).selectinload(PickAssignment.picker)
    )
    if status:
        q = q.filter(PickList.status == status)
    if search:
        q = q.filter(
            (PickList.order_number.ilike(f"%{search}%")) |
            (PickList.customer_name.ilike(f"%{search}%"))
        )
    result = await db.execute(q.order_by(desc(PickList.created_at)))
    return result.scalars().all()


@router.get("/my", response_model=List[PickListOut])
async def my_picklists(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Picker-facing: returns assigned pick lists for logged-in picker."""
    assignments = await db.execute(
        select(PickAssignment).filter(PickAssignment.picker_id == current_user.id)
    )
    assignment_ids = [a.pick_list_id for a in assignments.scalars().all()]
    if not assignment_ids:
        return []
    result = await db.execute(
        select(PickList)
        .options(
            selectinload(PickList.items),
            selectinload(PickList.boxes),
            selectinload(PickList.assignments).selectinload(PickAssignment.picker)
        )
        .filter(PickList.id.in_(assignment_ids))
        .filter(PickList.status.in_(["assigned", "picking", "waiting_verification"]))
        .order_by(desc(PickList.created_at))
    )
    return result.scalars().all()


@router.get("/{picklist_id}", response_model=PickListOut)
async def get_picklist(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PickList)
        .options(
            selectinload(PickList.items),
            selectinload(PickList.boxes),
            selectinload(PickList.assignments).selectinload(PickAssignment.picker)
        )
        .filter(PickList.id == picklist_id)
    )
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    return pl


# ---------- Generate ----------

@router.post("/generate/{order_id}")
async def generate_picklist(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(SalesOrder).filter(SalesOrder.id == order_id))
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    data = order.extracted_data
    matched_items = []
    unmatched_items = []

    for item in data.get("items", []):
        extracted_bc = item.get("barcode", "N/A") or "N/A"
        cat_result = await db.execute(
            select(SalesItem).filter(
                (SalesItem.primary_barcode == extracted_bc) | 
                (SalesItem.secondary_barcode == extracted_bc)
            )
        )
        cat_item = cat_result.scalars().first()
        matched_items.append({
            "barcode": extracted_bc,
            "primary_barcode": cat_item.primary_barcode if cat_item else extracted_bc,
            "secondary_barcode": cat_item.secondary_barcode if cat_item else extracted_bc,
            "standard_carton_quantity": cat_item.standard_carton_quantity if cat_item else 1,
            "product_name": cat_item.item_name if cat_item else item.get("product_name", "Item"),
            "quantity": item.get("quantity", 1),
            "unit": item.get("uom", "EA"),
            "available_quantity": cat_item.available_quantity if cat_item else 0,
            "bin_location": cat_item.bin_location if cat_item else None
        })

    if not matched_items:
        raise HTTPException(
            status_code=400,
            detail={"message": "Order contains no items to pick.", "errors": []}
        )
        
    validation_errors = []
    for mi in matched_items:
        req_qty = mi["quantity"]
        avail_qty = mi["available_quantity"]
        if avail_qty == 0:
            validation_errors.append({"barcode": mi["barcode"], "error": "Item is out of stock. Please restock in the Sales Catalogue or remove it from the order."})
        elif req_qty > avail_qty:
            validation_errors.append({"barcode": mi["barcode"], "error": f"Only {avail_qty} units available in stock. Please adjust the requested quantity."})
            
    if validation_errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Inventory validation failed", "errors": validation_errors}
        )

    db_picklist = PickList(
        order_number=data.get("order_number", f"ORD-{order_id}"),
        customer_name=data.get("customer_name", "Unknown"),
        sales_order_id=order.id,
        status="draft",
    )
    db.add(db_picklist)
    await db.flush()

    new_items = []
    for mi in matched_items:
        qty = mi["quantity"]
        scq = mi["standard_carton_quantity"]
        
        full_cartons = int(qty // scq) if scq > 0 else 0
        loose_pieces = qty % scq if scq > 0 else qty

        if full_cartons > 0:
            new_items.append(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=mi["primary_barcode"],
                product_name=mi["product_name"],
                quantity=full_cartons,
                unit="Carton",
                is_full_carton=True,
                bin_location=mi.get("bin_location"),
            ))
            
        if loose_pieces > 0 or full_cartons == 0:
            new_items.append(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=mi["secondary_barcode"] or mi["barcode"],
                product_name=mi["product_name"],
                quantity=loose_pieces,
                unit=mi["unit"],
                is_full_carton=False,
                bin_location=mi.get("bin_location"),
            ))

    db.add_all(new_items)
    order.status = "picklist_generated"
    await db.commit()
    await db.refresh(db_picklist)

    return {
        "message": "Pick list generated",
        "picklist_id": db_picklist.id,
        "order_number": db_picklist.order_number,
        "matched_count": len(matched_items),
        "unmatched_items": unmatched_items,
    }


# ---------- Assign ----------

@router.post("/{picklist_id}/assign/{picker_id}")
async def assign_picklist(
    picklist_id: int,
    picker_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    picklist = result.scalars().first()
    if not picklist:
        raise HTTPException(status_code=404, detail="Pick list not found")

    user_res = await db.execute(
        select(User).filter(User.id == picker_id, User.role == "picker", User.is_active == True)
    )
    picker = user_res.scalars().first()
    if not picker:
        raise HTTPException(status_code=404, detail="Picker not found or inactive")

    if not picker.is_available:
        raise HTTPException(status_code=400, detail="Picker is not available")

    assignment = PickAssignment(pick_list_id=picklist_id, picker_id=picker_id)
    db.add(assignment)
    picklist.status = "assigned"
    picker.is_available = False

    db.add(Notification(
        user_id=picker_id,
        type="pick_assignment",
        title="New Pick List Assigned",
        message=f"Order #{picklist.order_number} has been assigned to you.",
    ))

    await db.commit()

    trigger_push(
        picker.push_token,
        "New Pick List Assigned",
        f"Order #{picklist.order_number} has been assigned to you.",
        background_tasks=background_tasks,
    )

    return {"message": "Pick list assigned", "picklist_id": picklist_id}

@router.post("/{picklist_id}/auto-assign")
async def auto_assign_existing(
    picklist_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in ("admin", "lpo"):
        raise HTTPException(status_code=403, detail="Admin or LPO access required")
    from sqlalchemy import func as sqlfunc
    
    # 1. Fetch Picklist
    picklist_res = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    db_picklist = picklist_res.scalars().first()
    if not db_picklist:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if db_picklist.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft pick lists can be assigned")

    import random
    
    # 2. Find available picker
    users_res = await db.execute(
        select(User).filter(User.role == "picker", User.is_active == True, User.is_available == True)
    )
    pickers = users_res.scalars().all()
    if not pickers:
        raise HTTPException(status_code=400, detail="No available pickers right now")
        
    picker_loads = []
    active_statuses = ["assigned", "picking", "waiting_verification"]
    for p in pickers:
        count_res = await db.execute(
            select(sqlfunc.count(PickAssignment.id))
            .join(PickList)
            .filter(PickAssignment.picker_id == p.id, PickList.status.in_(active_statuses))
        )
        picker_loads.append((count_res.scalar() or 0, p))
        
    min_load = min(load for load, p in picker_loads)
    tied_pickers = [p for load, p in picker_loads if load == min_load]
    picker = random.choice(tied_pickers)

    # 3. Calculate sequence number
    active_statuses = ["assigned", "picking", "waiting_verification"]
    max_res = await db.execute(
        select(sqlfunc.max(PickList.picker_job_number))
        .join(PickAssignment, PickAssignment.pick_list_id == PickList.id)
        .filter(
            PickAssignment.picker_id == picker.id,
            PickList.status.in_(active_statuses)
        )
    )
    db_picklist.picker_job_number = (max_res.scalar() or 0) + 1
    db_picklist.status = "assigned"

    # 4. Assign
    assignment = PickAssignment(
        pick_list_id=db_picklist.id,
        picker_id=picker.id
    )
    db.add(assignment)
    picker.is_available = False
    
    await db.commit()

    # 5. Push Notification
    job_label = f"P-{str(db_picklist.picker_job_number).zfill(3)}"
    if picker.push_token:
        trigger_push(
            picker.push_token,
            f"New Job Assigned: {job_label}",
            f"Job {job_label} — Order #{db_picklist.order_number} assigned to your terminal.",
            background_tasks=background_tasks,
        )

    return {"message": "Auto-assigned successfully", "picker_name": picker.full_name}


@router.post("/direct-assign/{picker_id}")
async def direct_assign_picklist(
    picker_id: int,
    payload: DirectAssignRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Creates picklist directly from memory-extracted items and assigns to picker without saving intermediate orders!"""
    from sqlalchemy import func as sqlfunc
    user_res = await db.execute(
        select(User).filter(User.id == picker_id, User.role == "picker", User.is_active == True)
    )
    picker = user_res.scalars().first()
    if not picker:
        raise HTTPException(status_code=404, detail="Selected picker staff not found or inactive")

    # Compute picker-specific job sequence: MAX active job number for this picker + 1
    active_statuses = ["assigned", "picking", "waiting_verification"]
    max_res = await db.execute(
        select(sqlfunc.max(PickList.picker_job_number))
        .join(PickAssignment, PickAssignment.pick_list_id == PickList.id)
        .filter(
            PickAssignment.picker_id == picker_id,
            PickList.status.in_(active_statuses)
        )
    )
    current_max = max_res.scalar() or 0
    next_job_number = current_max + 1

    db_picklist = PickList(
        order_number=payload.order_number,
        customer_name=payload.customer_name,
        sales_order_id=None,
        sales_person_id=payload.sales_person_id,
        status="assigned",
        picker_job_number=next_job_number,
        delivery_date=payload.delivery_date,
    )
    db.add(db_picklist)
    await db.flush()

    # Bulk fetch all matching catalogue items to avoid N+1 database queries
    all_barcodes = [item.barcode or "N/A" for item in payload.items]
    cat_res = await db.execute(select(SalesItem).filter(
        (SalesItem.primary_barcode.in_(all_barcodes)) | 
        (SalesItem.secondary_barcode.in_(all_barcodes))
    ))
    # Map both primary and secondary barcodes to the cat item
    cat_map = {}
    for ci in cat_res.scalars().all():
        cat_map[ci.primary_barcode] = ci
        if ci.secondary_barcode:
            cat_map[ci.secondary_barcode] = ci

    validation_errors = []
    for item in payload.items:
        bc = item.barcode or "N/A"
        req_qty = item.quantity or 1
        cat_item = cat_map.get(bc)
        avail_qty = cat_item.available_quantity if cat_item else 0
        
        if avail_qty == 0:
            validation_errors.append({"barcode": bc, "error": "Item is out of stock. Please restock in the Sales Catalogue or remove it from the order."})
        elif req_qty > avail_qty:
            validation_errors.append({"barcode": bc, "error": f"Only {avail_qty} units available in stock. Please adjust the requested quantity."})

    if validation_errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Inventory validation failed", "errors": validation_errors}
        )

    verified_count = 0
    new_items = []
    for item in payload.items:
        bc = item.barcode or "N/A"
        cat_item = cat_map.get(bc)

        qty = item.quantity or 1
        scq = cat_item.standard_carton_quantity if cat_item else 1
        
        full_cartons = int(qty // scq) if scq > 0 else 0
        loose_pieces = qty % scq if scq > 0 else qty

        if full_cartons > 0:
            new_items.append(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=cat_item.primary_barcode if cat_item else bc,
                product_name=cat_item.item_name if cat_item else (item.product_name or "Item"),
                quantity=full_cartons,
                unit="Carton",
                is_full_carton=True,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            verified_count += 1
            
        if loose_pieces > 0 or full_cartons == 0:
            new_items.append(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=cat_item.secondary_barcode if (cat_item and cat_item.secondary_barcode) else bc,
                product_name=cat_item.item_name if cat_item else (item.product_name or "Item"),
                quantity=loose_pieces,
                unit=item.unit or "EA",
                is_full_carton=False,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            verified_count += 1

    if verified_count == 0:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": "Cannot assign pick list: No items attached to order.", "errors": []}
        )
    
    db.add_all(new_items)

    assignment = PickAssignment(pick_list_id=db_picklist.id, picker_id=picker_id)
    db.add(assignment)
    picker.is_available = False

    job_label = f"P-{str(next_job_number).zfill(3)}"
    db.add(Notification(
        user_id=picker_id,
        type="pick_assignment",
        title=f"New Job Assigned: {job_label}",
        message=f"Job {job_label} (Order #{db_picklist.order_number}) has been routed to your terminal.",
    ))

    await db.commit()
    await db.refresh(db_picklist)

    trigger_push(
        picker.push_token,
        f"New Job Assigned: {job_label}",
        f"Job {job_label} — Order #{db_picklist.order_number} assigned to your terminal.",
        background_tasks=background_tasks,
    )

    return {"message": "Pick list generated and assigned to staff directly", "picklist_id": db_picklist.id, "job_label": job_label}

@router.post("/direct-assign-auto")
async def direct_assign_auto(
    payload: DirectAssignRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Creates picklist directly and auto-assigns to the first available picker (round-robin style)."""
    from sqlalchemy import func as sqlfunc
    
    picker = None
    next_job_number = None

    if payload.auto_assign:
        import random
        # Find all available pickers
        users_res = await db.execute(
            select(User).filter(User.role == "picker", User.is_active == True, User.is_available == True)
        )
        pickers = users_res.scalars().all()
        if not pickers:
            raise HTTPException(status_code=400, detail="No available pickers right now. Please try again later.")
            
        active_statuses = ["assigned", "picking", "waiting_verification"]
        picker_loads = []
        for p in pickers:
            count_res = await db.execute(
                select(sqlfunc.count(PickAssignment.id))
                .join(PickList)
                .filter(PickAssignment.picker_id == p.id, PickList.status.in_(active_statuses))
            )
            picker_loads.append((count_res.scalar() or 0, p))
            
        min_load = min(load for load, p in picker_loads)
        tied_pickers = [p for load, p in picker_loads if load == min_load]
        picker = random.choice(tied_pickers)

        active_statuses = ["assigned", "picking", "waiting_verification"]
        max_res = await db.execute(
            select(sqlfunc.max(PickList.picker_job_number))
            .join(PickAssignment, PickAssignment.pick_list_id == PickList.id)
            .filter(
                PickAssignment.picker_id == picker.id,
                PickList.status.in_(active_statuses)
            )
        )
        current_max = max_res.scalar() or 0
        next_job_number = current_max + 1

    db_picklist = PickList(
        order_number=payload.order_number,
        customer_name=payload.customer_name,
        sales_order_id=None,
        sales_person_id=payload.sales_person_id,
        status="assigned" if payload.auto_assign else "draft",
        picker_job_number=next_job_number,
        delivery_date=payload.delivery_date,
    )
    db.add(db_picklist)
    await db.flush()

    # Bulk fetch all matching catalogue items
    all_barcodes = [item.barcode or "N/A" for item in payload.items]
    cat_res = await db.execute(select(SalesItem).filter(
        (SalesItem.primary_barcode.in_(all_barcodes)) | 
        (SalesItem.secondary_barcode.in_(all_barcodes))
    ))
    cat_map = {}
    for ci in cat_res.scalars().all():
        cat_map[ci.primary_barcode] = ci
        if ci.secondary_barcode:
            cat_map[ci.secondary_barcode] = ci

    validation_errors = []
    for item in payload.items:
        bc = item.barcode or "N/A"
        req_qty = item.quantity or 1
        cat_item = cat_map.get(bc)
        avail_qty = cat_item.available_quantity if cat_item else 0
        
        if avail_qty == 0:
            validation_errors.append({"barcode": bc, "error": "Item is out of stock."})
        elif req_qty > avail_qty:
            validation_errors.append({"barcode": bc, "error": f"Only {avail_qty} units available."})

    if validation_errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Inventory validation failed", "errors": validation_errors}
        )

    verified_count = 0
    new_items = []
    for item in payload.items:
        bc = item.barcode or "N/A"
        cat_item = cat_map.get(bc)

        qty = item.quantity or 1
        scq = cat_item.standard_carton_quantity if cat_item else 1
        
        full_cartons = int(qty // scq) if scq > 0 else 0
        loose_pieces = qty % scq if scq > 0 else qty

        if full_cartons > 0:
            new_items.append(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=cat_item.primary_barcode if cat_item else bc,
                product_name=cat_item.item_name if cat_item else (item.product_name or "Item"),
                quantity=full_cartons,
                unit="Carton",
                is_full_carton=True,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            verified_count += 1
            
        if loose_pieces > 0 or full_cartons == 0:
            new_items.append(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=cat_item.secondary_barcode if (cat_item and cat_item.secondary_barcode) else bc,
                product_name=cat_item.item_name if cat_item else (item.product_name or "Item"),
                quantity=loose_pieces,
                unit=item.unit or "EA",
                is_full_carton=False,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            verified_count += 1

    if verified_count == 0:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": "Cannot assign pick list: No items attached.", "errors": []}
        )
    
    db.add_all(new_items)

    if not payload.auto_assign:
        await db.commit()
        return {"message": "Pick list created as draft", "picklist_id": db_picklist.id, "job_label": f"PL-{db_picklist.id}"}

    assignment = PickAssignment(pick_list_id=db_picklist.id, picker_id=picker.id)
    db.add(assignment)
    picker.is_available = False

    job_label = f"P-{str(next_job_number).zfill(3)}"
    db.add(Notification(
        user_id=picker.id,
        type="pick_assignment",
        title=f"New Job Assigned: {job_label}",
        message=f"Job {job_label} (Order #{db_picklist.order_number}) has been routed to your terminal.",
    ))

    await db.commit()
    await db.refresh(db_picklist)

    trigger_push(
        picker.push_token,
        f"New Job Assigned: {job_label}",
        f"Job {job_label} — Order #{db_picklist.order_number} assigned to your terminal.",
        background_tasks=background_tasks,
    )

    return {"message": "Auto-assigned to picker successfully", "picklist_id": db_picklist.id, "job_label": job_label, "picker_name": picker.full_name}

# ---------- Picking (Mobile) ----------

class PickQuantityRequest(BaseModel):
    picked_quantity: Optional[float] = None

@router.patch("/{picklist_id}/items/{item_id}/pick")
async def mark_item_picked(
    picklist_id: int,
    item_id: int,
    payload: Optional[PickQuantityRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PickListItem).filter(
            PickListItem.id == item_id,
            PickListItem.pick_list_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if payload and payload.picked_quantity is not None:
        item.picked_quantity = payload.picked_quantity
        item.is_picked = True
    else:
        item.is_picked = not item.is_picked
        if not item.is_picked:
            item.picked_quantity = 0.0

    item.picked_at = datetime.now(timezone.utc) if item.is_picked else None

    pl_result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = pl_result.scalars().first()
    if pl and pl.status == "assigned":
        pl.status = "picking"

    await db.commit()
    return {"is_picked": item.is_picked, "item_id": item_id}


@router.patch("/{picklist_id}/items/{item_id}/audit")
async def audit_item(
    picklist_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(
        select(PickListItem).filter(
            PickListItem.id == item_id,
            PickListItem.pick_list_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_audited = not item.is_audited
    await db.commit()
    return {"is_audited": item.is_audited, "item_id": item_id}

@router.post("/{picklist_id}/boxes/{box_id}/verify")
async def verify_box(
    picklist_id: int,
    box_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PickListBox)
        .options(selectinload(PickListBox.box_items).selectinload(PickListBoxItem.item))
        .filter(PickListBox.id == box_id, PickListBox.pick_list_id == picklist_id)
    )
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
        
    box.is_audited = True
    
    # Also update all items inside this box
    for bi in box.box_items:
        if bi.item:
            bi.item.is_audited = True

    await db.commit()
    return {"message": "Box verified successfully"}

@router.post("/{picklist_id}/items/{item_id}/verify")
async def verify_item(
    picklist_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PickListItem)
        .filter(PickListItem.id == item_id, PickListItem.pick_list_id == picklist_id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    item.is_audited = True
    await db.commit()
    return {"message": "Item verified successfully"}

@router.post("/{picklist_id}/complete-picking")
async def complete_picking(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    if pl.active_box_carton_id is not None or pl.active_box_contents:
        raise HTTPException(
            status_code=400, 
            detail="Cannot complete job: you have an active box that must be sealed first."
        )

    items_res = await db.execute(
        select(PickListItem).filter(PickListItem.pick_list_id == picklist_id)
    )
    items = items_res.scalars().all()

    # Auto-mark any remaining items as picked (handles sync glitches gracefully)
    now = datetime.now(timezone.utc)
    for item in items:
        if not item.is_picked:
            item.is_picked = True
            item.picked_at = now

    pl.status = "waiting_verification"

    assignment_res = await db.execute(
        select(PickAssignment).filter(PickAssignment.pick_list_id == picklist_id)
    )
    assignment = assignment_res.scalars().first()
    if assignment:
        assignment.completed_at = now

    await db.commit()
    return {"message": "Picking complete. Awaiting verification."}


# ---------- Boxing & Missing Items ----------

class PreviewWeightRequest(BaseModel):
    item_ids: List[int]
    carton_type_id: int

@router.post("/{picklist_id}/boxes/preview-weight")
async def preview_box_weight(
    picklist_id: int,
    payload: PreviewWeightRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns the expected weight for the selected items + carton type before the picker commits."""
    carton_res = await db.execute(select(CartonType).filter(CartonType.id == payload.carton_type_id))
    carton = carton_res.scalars().first()
    if not carton:
        raise HTTPException(status_code=400, detail="Carton type not found")

    items_res = await db.execute(
        select(PickListItem).filter(
            PickListItem.id.in_(payload.item_ids),
            PickListItem.pick_list_id == picklist_id
        )
    )
    items = items_res.scalars().all()

    barcodes = [item.barcode for item in items]
    cat_items_res = await db.execute(select(SalesItem).filter(SalesItem.barcode.in_(barcodes)))
    cat_map = {ci.barcode: ci for ci in cat_items_res.scalars().all()}

    expected_weight = carton.tare_weight
    for item in items:
        ci = cat_map.get(item.barcode)
        if ci:
            expected_weight += (ci.packaging_weight * item.quantity)

    return {
        "expected_weight": round(expected_weight, 3),
        "tare_weight": carton.tare_weight,
        "items_net_weight": round(expected_weight - carton.tare_weight, 3),
    }

@router.post("/{picklist_id}/boxes", response_model=PickListBoxOut)
async def create_box(
    picklist_id: int,
    payload: PickListBoxCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
        
    # Weight tolerance validation
    carton_res = await db.execute(select(CartonType).filter(CartonType.id == payload.carton_type_id))
    carton = carton_res.scalars().first()
    if not carton:
        raise HTTPException(status_code=400, detail="Carton type not found")
        
    items_res = await db.execute(
        select(PickListItem).filter(
            PickListItem.id.in_(payload.item_ids),
            PickListItem.pick_list_id == picklist_id
        )
    )
    items = items_res.scalars().all()
    if not items:
        raise HTTPException(status_code=400, detail="No valid items to box")
        
    barcodes = [item.barcode for item in items]
    cat_items_res = await db.execute(select(SalesItem).filter(SalesItem.barcode.in_(barcodes)))
    cat_items = cat_items_res.scalars().all()
    cat_map = {ci.barcode: ci for ci in cat_items}
    
    expected_weight = carton.tare_weight
    for item in items:
        ci = cat_map.get(item.barcode)
        if ci:
            expected_weight += (ci.packaging_weight * item.quantity)
            
    # Allow configurable tolerance (default ±5%)
    lower_bound = expected_weight * (1 - WEIGHT_TOLERANCE_FRACTION)
    upper_bound = expected_weight * (1 + WEIGHT_TOLERANCE_FRACTION)

    if payload.entered_weight < lower_bound or payload.entered_weight > upper_bound:
        raise HTTPException(status_code=400, detail=f"Weight validation failed. Expected ~{expected_weight:.2f}kg, but got {payload.entered_weight:.2f}kg. Please reweigh and check missing items.")
        
    box = PickListBox(
        pick_list_id=picklist_id,
        carton_type_id=payload.carton_type_id,
        entered_weight=payload.entered_weight
    )
    db.add(box)
    await db.flush()
    
    for item in items:
        item.box_id = box.id
        item.is_full_carton = False # boxed items are loose items
        
    await db.commit()
    await db.refresh(box)
    return box

@router.post("/{picklist_id}/boxes/estimate-weight")
async def estimate_box_weight(
    picklist_id: int,
    payload: SealBoxCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    carton_res = await db.execute(select(CartonType).filter(CartonType.id == payload.carton_type_id))
    carton = carton_res.scalars().first()
    if not carton:
        raise HTTPException(status_code=400, detail="Carton type not found")

    item_ids = [c.item_id for c in payload.contents]
    items_res = await db.execute(
        select(PickListItem).filter(
            PickListItem.id.in_(item_ids),
            PickListItem.pick_list_id == picklist_id
        )
    )
    db_items = {item.id: item for item in items_res.scalars().all()}
    
    barcodes = [db_items[c.item_id].barcode for c in payload.contents if c.item_id in db_items]
    cat_res = await db.execute(
        select(SalesItem).filter(
            (SalesItem.primary_barcode.in_(barcodes)) | 
            (SalesItem.secondary_barcode.in_(barcodes))
        )
    )
    cat_map = {}
    for ci in cat_res.scalars().all():
        if ci.primary_barcode in barcodes:
            cat_map[ci.primary_barcode] = ci
        if ci.secondary_barcode in barcodes:
            cat_map[ci.secondary_barcode] = ci

    breakdown = []
    total_items_weight = 0.0

    for content in payload.contents:
        if content.item_id not in db_items:
            continue
        item = db_items[content.item_id]
        cat_item = cat_map.get(item.barcode)
        unit_weight = cat_item.packaging_weight if (cat_item and cat_item.packaging_weight) else 0.0
        line_weight = unit_weight * content.quantity
        total_items_weight += line_weight
        breakdown.append({
            "product_name": item.product_name,
            "quantity": content.quantity,
            "unit_weight": unit_weight,
            "line_weight": line_weight
        })
        
    expected_weight = carton.tare_weight + total_items_weight
    
    return {
        "tare_weight": carton.tare_weight,
        "total_items_weight": total_items_weight,
        "expected_weight": expected_weight,
        "breakdown": breakdown
    }

# ---------- Purge/Cancel ----------

# ---------- Active Draft Box ----------

class ActiveBoxContent(BaseModel):
    item_id: int
    quantity: float
    item_name: str

class ActiveBoxData(BaseModel):
    carton_type_id: int
    carton_name: str
    contents: List[ActiveBoxContent]

@router.get("/{picklist_id}/active-box")
async def get_active_box(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pl_res = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = pl_res.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
        
    if not pl.active_box_carton_id or not pl.active_box_contents:
        return None
        
    carton_res = await db.execute(select(CartonType).filter(CartonType.id == pl.active_box_carton_id))
    carton = carton_res.scalars().first()
    if not carton:
        return None

    return {
        "carton_type_id": carton.id,
        "carton_name": carton.name,
        "contents": pl.active_box_contents
    }

@router.put("/{picklist_id}/active-box")
async def set_active_box(
    picklist_id: int,
    payload: Optional[ActiveBoxData] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pl_res = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = pl_res.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
        
    if not payload:
        pl.active_box_carton_id = None
        pl.active_box_contents = None
    else:
        pl.active_box_carton_id = payload.carton_type_id
        pl.active_box_contents = [c.model_dump() for c in payload.contents]
        
    await db.commit()
    return {"status": "ok"}

@router.delete("/{picklist_id}/active-box")
async def clear_active_box(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pl_res = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = pl_res.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
        
    pl.active_box_carton_id = None
    pl.active_box_contents = None
    await db.commit()
    return {"status": "ok"}

# ---------- Seal Loose Item Box ----------

@router.post("/{picklist_id}/boxes/seal", response_model=PickListBoxOut)
async def seal_loose_item_box(
    picklist_id: int,
    payload: SealBoxCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Seals a loose-item box at the weighing station.
    
    The picker calls this after selecting a carton type and scanning items into it.
    Each entry in `contents` records exactly which item and how many units went
    into this specific physical box.
    
    Weight validation uses the actual box quantities (not the full picked_quantity),
    so partial splits across multiple boxes work correctly.
    """
    # Validate picklist exists
    pl_res = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = pl_res.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    # Validate carton type from master data
    carton_res = await db.execute(select(CartonType).filter(CartonType.id == payload.carton_type_id))
    carton = carton_res.scalars().first()
    if not carton:
        raise HTTPException(status_code=400, detail="Carton type not found")

    if not payload.contents:
        raise HTTPException(status_code=400, detail="Box contents cannot be empty")

    # Load all referenced items and validate they belong to this picklist
    item_ids = [c.item_id for c in payload.contents]
    items_res = await db.execute(
        select(PickListItem).filter(
            PickListItem.id.in_(item_ids),
            PickListItem.pick_list_id == picklist_id,
            PickListItem.is_full_carton == False,  # only loose items
        )
    )
    db_items = {item.id: item for item in items_res.scalars().all()}

    # Validate all requested item_ids exist and are loose items
    missing_ids = [c.item_id for c in payload.contents if c.item_id not in db_items]
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Item IDs not found or are not loose items: {missing_ids}"
        )

    # Validate box quantities don't exceed what was actually picked
    for content in payload.contents:
        item = db_items[content.item_id]
        # Sum already-boxed quantity for this item across previous boxes
        existing_res = await db.execute(
            select(PickListBoxItem).filter(
                PickListBoxItem.item_id == content.item_id
            )
        )
        already_boxed = sum(bi.quantity for bi in existing_res.scalars().all())
        available_to_box = (item.picked_quantity or 0.0) - already_boxed
        if content.quantity > available_to_box + 0.001:  # small float tolerance
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot box {content.quantity} of item '{item.product_name}'. "
                    f"Only {available_to_box:.2f} units remain unboxed "
                    f"(picked: {item.picked_quantity}, already boxed: {already_boxed})."
                )
            )

    # Calculate expected weight from actual box contents (not full item qty)
    barcodes = [db_items[c.item_id].barcode for c in payload.contents]
    cat_res = await db.execute(
        select(SalesItem).filter(
            (SalesItem.primary_barcode.in_(barcodes)) | 
            (SalesItem.secondary_barcode.in_(barcodes))
        )
    )
    cat_map = {}
    for ci in cat_res.scalars().all():
        if ci.primary_barcode in barcodes:
            cat_map[ci.primary_barcode] = ci
        if ci.secondary_barcode in barcodes:
            cat_map[ci.secondary_barcode] = ci

    expected_weight = carton.tare_weight
    for content in payload.contents:
        item = db_items[content.item_id]
        cat_item = cat_map.get(item.barcode)
        if cat_item and cat_item.packaging_weight:
            expected_weight += cat_item.packaging_weight * content.quantity

    # Weight tolerance check (±WEIGHT_TOLERANCE_FRACTION, default ±5%)
    lower_bound = expected_weight * (1 - WEIGHT_TOLERANCE_FRACTION)
    upper_bound = expected_weight * (1 + WEIGHT_TOLERANCE_FRACTION)

    if payload.entered_weight < lower_bound or payload.entered_weight > upper_bound:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Weight validation failed. Expected ~{expected_weight:.2f} kg "
                f"(±{WEIGHT_TOLERANCE_FRACTION*100:.1f}%), got {payload.entered_weight:.2f} kg. "
                "Please reweigh or check for missing items."
            )
        )

    # Create the box record
    box = PickListBox(
        pick_list_id=picklist_id,
        carton_type_id=payload.carton_type_id,
        entered_weight=payload.entered_weight,
    )
    db.add(box)
    await db.flush()  # get box.id

    # Create box-item mapping entries
    for content in payload.contents:
        db.add(PickListBoxItem(
            box_id=box.id,
            item_id=content.item_id,
            quantity=content.quantity,
        ))

    await db.commit()
    await db.refresh(box)
    return box

@router.patch("/{picklist_id}/items/{item_id}/report-missing")
async def report_missing_item(
    picklist_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PickListItem).filter(
            PickListItem.id == item_id,
            PickListItem.pick_list_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.missing_reported = True
    await db.commit()
    return {"message": "Missing reported", "item_id": item_id}

@router.patch("/{picklist_id}/items/{item_id}/approve-missing")
async def approve_missing_item(
    picklist_id: int,
    item_id: int,
    approved: bool = Query(..., description="True to approve missing, False to reject"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(
        select(PickListItem).filter(
            PickListItem.id == item_id,
            PickListItem.pick_list_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if approved:
        item.missing_approved = True
        item.is_picked = False # missing item is not picked
    else:
        item.missing_approved = False
        item.missing_reported = False # rejected, need to find it

    await db.commit()
    return {"message": "Missing status updated", "item_id": item_id}


# ---------- Verification ----------

@router.patch("/{picklist_id}/return")
async def return_to_picker(
    picklist_id: int,
    background_tasks: BackgroundTasks,
    reason: Optional[str] = Query("Please check unverified items and resubmit."),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    pl.status = "picking"
    
    # Mark incomplete items as un-picked so the picker knows what to pick
    items_res = await db.execute(select(PickListItem).filter(PickListItem.pick_list_id == picklist_id))
    for item in items_res.scalars().all():
        if (item.picked_quantity or 0) < item.quantity:
            item.is_picked = False

    assignment_res = await db.execute(
        select(PickAssignment).filter(PickAssignment.pick_list_id == picklist_id)
    )
    assignment = assignment_res.scalars().first()

    if assignment:
        picker_res = await db.execute(select(User).filter(User.id == assignment.picker_id))
        picker = picker_res.scalars().first()
        if picker:
            db.add(Notification(
                user_id=picker.id,
                type="pick_returned",
                title="Pick List Returned for Re-picking",
                message=f"Order #{pl.order_number} returned: {reason}",
            ))
            trigger_push(
                picker.push_token,
                "Pick List Returned for Correction",
                f"Order #{pl.order_number}: {reason}",
                background_tasks=background_tasks,
            )

    await db.commit()
    return {"message": "Returned to picker"}


from backend.services.picklist_service import verify_picklist_service

@router.patch("/{picklist_id}/verify")
async def verify_picklist(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """
    Verifies a picklist, deducting inventory automatically.
    """
    return await verify_picklist_service(picklist_id, db)


# ---------- Export ----------

@router.get("/{picklist_id}/download/pdf")
async def download_pdf(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(
        select(PickList)
        .options(selectinload(PickList.items))
        .filter(PickList.id == picklist_id)
    )
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    pdf_bytes = generate_picklist_pdf(pl)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=picklist_{timestamp}.pdf"},
    )


@router.get("/{picklist_id}/download/excel")
async def download_excel(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(
        select(PickList)
        .options(selectinload(PickList.items))
        .filter(PickList.id == picklist_id)
    )
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    excel_bytes = generate_picklist_excel(pl)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=picklist_{timestamp}.xlsx"},
    )


class ExportPreviewItem(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str = "PCS"

@router.post("/export-preview-excel")
async def export_preview_excel(
    items: List[ExportPreviewItem],
    current_user=Depends(get_current_admin),
):
    excel_bytes = generate_branded_picklist_excel([item.dict() for item in items])
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=picklist_{timestamp}.xlsx"},
    )


# ---------- Complete & Purge / Cancel ----------

@router.delete("/{picklist_id}")
@router.delete("/{picklist_id}/cancel")
async def cancel_and_purge_picklist(
    picklist_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Cancels an ongoing or draft job, resets assigned picker availability, and cleanly removes all data from the database."""
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list job not found")

    order_id = pl.sales_order_id

    # 1. Reset picker availability, clear old task alerts, and issue cancellation notice
    assignment_res = await db.execute(select(PickAssignment).filter(PickAssignment.pick_list_id == picklist_id))
    assignments = assignment_res.scalars().all()
    for assign in assignments:
        picker_res = await db.execute(select(User).filter(User.id == assign.picker_id))
        picker = picker_res.scalars().first()
        if picker:
            picker.is_available = True
            await db.execute(
                delete(Notification).where(
                    (Notification.user_id == picker.id) & 
                    (Notification.message.ilike(f"%{pl.order_number}%")) &
                    (Notification.type == "pick_assignment")
                )
            )
            # Create explicit cancellation notification in user's in-app feed
            db.add(Notification(
                user_id=picker.id,
                type="job_cancelled",
                title="Assigned Job Cancelled",
                message=f"Order #{pl.order_number} assigned to you has been cancelled by admin and removed from your queue.",
            ))
            trigger_push(
                picker.push_token,
                "Assigned Job Cancelled",
                f"Order #{pl.order_number} has been cancelled by admin and removed from your tasks.",
                background_tasks=background_tasks,
            )
        await db.delete(assign)

    # 2. Delete all items attached to this job
    await db.execute(delete(PickListItem).where(PickListItem.pick_list_id == picklist_id))

    # 3. Purge original sales order if linked
    if order_id:
        order_res = await db.execute(select(SalesOrder).filter(SalesOrder.id == order_id))
        order = order_res.scalars().first()
        if order:
            await db.delete(order)

    # 4. Remove the pick list task itself from database
    await db.delete(pl)
    await db.commit()
    return {"message": "Ongoing job cancelled and removed from database successfully."}


@router.delete("/{picklist_id}/complete")
async def purge_completed_picklist(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    order_id = pl.sales_order_id

    # Reset picker availability & clear notifications
    assignment_res = await db.execute(select(PickAssignment).filter(PickAssignment.pick_list_id == picklist_id))
    assignments = assignment_res.scalars().all()
    for assign in assignments:
        picker_res = await db.execute(select(User).filter(User.id == assign.picker_id))
        picker = picker_res.scalars().first()
        if picker:
            picker.is_available = True
            await db.execute(
                delete(Notification).where(
                    (Notification.user_id == picker.id) & 
                    (Notification.message.ilike(f"%{pl.order_number}%"))
                )
            )
        await db.delete(assign)

    await db.execute(delete(PickListItem).where(PickListItem.pick_list_id == picklist_id))

    if order_id:
        order_res = await db.execute(select(SalesOrder).filter(SalesOrder.id == order_id))
        order = order_res.scalars().first()
        if order:
            await db.delete(order)

    await db.delete(pl)
    await db.commit()
    return {"message": "Order completed and all operational data cleanly purged from the database."}

class ReassignRequest(BaseModel):
    new_picker_id: int

@router.patch("/{picklist_id}/reassign")
async def reassign_picklist(
    picklist_id: int,
    payload: ReassignRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    picklist = result.scalars().first()
    if not picklist:
        raise HTTPException(status_code=404, detail="Pick list not found")

    new_user_res = await db.execute(
        select(User).filter(User.id == payload.new_picker_id, User.role == "picker", User.is_active == True)
    )
    new_picker = new_user_res.scalars().first()
    if not new_picker:
        raise HTTPException(status_code=404, detail="New picker not found or inactive")
    if not new_picker.is_available:
        raise HTTPException(status_code=400, detail="New picker is not available")

    assignment_res = await db.execute(
        select(PickAssignment).filter(PickAssignment.pick_list_id == picklist_id)
    )
    old_assignments = assignment_res.scalars().all()
    
    if old_assignments:
        old_assignment = old_assignments[-1]
        if old_assignment.picker_id == payload.new_picker_id:
            raise HTTPException(status_code=400, detail="Pick list is already assigned to this picker")
            
        old_user_res = await db.execute(select(User).filter(User.id == old_assignment.picker_id))
        old_picker = old_user_res.scalars().first()
        if old_picker:
            old_picker.is_available = True
            db.add(Notification(
                user_id=old_picker.id,
                type="job_cancelled",
                title="Job Reassigned",
                message=f"Order #{picklist.order_number} has been reassigned to another picker.",
            ))
            trigger_push(
                old_picker.push_token,
                "Job Reassigned",
                f"Order #{picklist.order_number} has been reassigned to another picker.",
                background_tasks=background_tasks,
            )

    new_assignment = PickAssignment(pick_list_id=picklist_id, picker_id=new_picker.id)
    db.add(new_assignment)
    new_picker.is_available = False
    
    db.add(Notification(
        user_id=new_picker.id,
        type="pick_assignment",
        title="New Job Assigned",
        message=f"Order #{picklist.order_number} has been reassigned to you.",
    ))
    trigger_push(
        new_picker.push_token,
        "New Job Assigned",
        f"Order #{picklist.order_number} has been reassigned to you.",
        background_tasks=background_tasks,
    )

    await db.commit()
    return {"message": "Reassigned successfully"}

class ToggleCartonRequest(BaseModel):
    is_full_carton: bool

@router.patch("/{picklist_id}/items/{item_id}/toggle-carton")
async def toggle_item_carton(
    picklist_id: int,
    item_id: int,
    payload: ToggleCartonRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PickListItem).filter(
            PickListItem.id == item_id,
            PickListItem.pick_list_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_full_carton = payload.is_full_carton
    await db.commit()
    return {"is_full_carton": item.is_full_carton}
