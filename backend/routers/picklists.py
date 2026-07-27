from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone
import asyncio
import httpx
import io

from backend.database import get_db
from backend.models.picklist import PickList, PickListItem, PickAssignment
from backend.models.order import SalesOrder

class DirectAssignItem(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str = "PCS"

class DirectAssignRequest(BaseModel):
    order_number: str
    customer_name: str
    items: List[DirectAssignItem]

from backend.models.user import User, Notification
from backend.models.catalogue import SalesItem
from backend.schemas.picklist import PickListOut
from backend.dependencies import get_current_user, get_current_admin, get_current_picker
from backend.config import settings
from backend.services.pdf_generator import generate_picklist_pdf
from backend.services.excel_service import generate_picklist_excel, generate_branded_picklist_excel

router = APIRouter(prefix="/picklists", tags=["picklists"])


def _send_push_sync(push_token: str, title: str, body: str):
    if not push_token:
        return
    try:
        with httpx.Client(timeout=1.0) as client:
            client.post(
                settings.EXPO_PUSH_URL,
                json={"to": push_token, "title": title, "body": body},
            )
    except Exception:
        pass


def trigger_push(push_token: str, title: str, body: str, background_tasks: Optional[BackgroundTasks] = None):
    if not push_token:
        return
    if background_tasks is not None:
        background_tasks.add_task(_send_push_sync, push_token, title, body)
    else:
        try:
            loop = asyncio.get_running_loop()
            loop.run_in_executor(None, _send_push_sync, push_token, title, body)
        except Exception:
            pass


# ---------- List ----------

@router.get("/", response_model=List[PickListOut])
async def list_picklists(
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    q = select(PickList).options(
        selectinload(PickList.items),
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
    current_user=Depends(get_current_picker),
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
        barcode = item.get("barcode", "N/A") or "N/A"
        cat_result = await db.execute(
            select(SalesItem).filter(SalesItem.barcode == barcode)
        )
        cat_item = cat_result.scalars().first()
        matched_items.append({
            "barcode": barcode,
            "product_name": cat_item.item_name if cat_item else item.get("product_name", "Item"),
            "quantity": item.get("quantity", 1),
            "unit": item.get("uom", "EA"),
        })

    if not matched_items:
        raise HTTPException(
            status_code=400,
            detail="Order contains no items to pick.",
        )

    db_picklist = PickList(
        order_number=data.get("order_number", f"ORD-{order_id}"),
        customer_name=data.get("customer_name", "Unknown"),
        sales_order_id=order.id,
        status="draft",
    )
    db.add(db_picklist)
    await db.flush()

    for mi in matched_items:
        db.add(PickListItem(
            pick_list_id=db_picklist.id,
            barcode=mi["barcode"],
            product_name=mi["product_name"],
            quantity=mi["quantity"],
            unit=mi["unit"],
        ))

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
        status="assigned",
        picker_job_number=next_job_number,
    )
    db.add(db_picklist)
    await db.flush()

    # Bulk fetch all matching catalogue items to avoid N+1 database queries
    all_barcodes = [item.barcode or "N/A" for item in payload.items]
    cat_res = await db.execute(select(SalesItem).filter(SalesItem.barcode.in_(all_barcodes)))
    cat_map = {ci.barcode: ci for ci in cat_res.scalars().all()}

    verified_count = 0
    for item in payload.items:
        bc = item.barcode or "N/A"
        cat_item = cat_map.get(bc)

        db.add(PickListItem(
            pick_list_id=db_picklist.id,
            barcode=bc,
            product_name=cat_item.item_name if cat_item else (item.product_name or "Item"),
            quantity=item.quantity or 1,
            unit=item.unit or "EA",
        ))
        verified_count += 1

    if verified_count == 0:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Cannot assign pick list: No items attached to order."
        )

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


# ---------- Picking (Mobile) ----------

@router.patch("/{picklist_id}/items/{item_id}/pick")
async def mark_item_picked(
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

    item.is_picked = not item.is_picked
    item.picked_at = datetime.now(timezone.utc) if item.is_picked else None

    pl_result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = pl_result.scalars().first()
    if pl and pl.status == "assigned":
        pl.status = "picking"

    await db.commit()
    return {"is_picked": item.is_picked, "item_id": item_id}


@router.post("/{picklist_id}/complete-picking")
async def complete_picking(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_picker),
):
    result = await db.execute(select(PickList).filter(PickList.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

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


@router.patch("/{picklist_id}/verify")
async def verify_picklist(
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
    if pl.status not in ("waiting_verification", "picking", "assigned"):
        raise HTTPException(status_code=400, detail="Pick list is not in an active operational state")

    pl.status = "verified"

    # Reset picker availability & purge associated operational notifications
    assignment_res = await db.execute(select(PickAssignment).filter(PickAssignment.pick_list_id == picklist_id))
    assignments = assignment_res.scalars().all()
    for assign in assignments:
        assign.completed_at = datetime.now(timezone.utc)
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

    if pl.sales_order_id:
        order_res = await db.execute(select(SalesOrder).filter(SalesOrder.id == pl.sales_order_id))
        order = order_res.scalars().first()
        if order:
            order.status = "verified"

    await db.commit()
    return {"message": "Order verified successfully", "picklist_id": pl.id}


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
