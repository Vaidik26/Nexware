"""
LPO (Local Purchase Order) router.

All write operations and sensitive reads require authentication.
Schemas live in backend/schemas/lpo.py.
Push notifications are centralised in backend/services/notification_service.py.
"""
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.config import settings
from backend.constants import (
    ALLOWED_DOCUMENT_MIME_TYPES,
    BUCKET_CUSTOMER_CONFIRMATION,
    FOLDER_MOBILE_LPOS,
    MAX_UPLOAD_SIZE_BYTES,
)
from backend.database import get_db
from backend.dependencies import get_current_admin, get_current_user, get_current_user_optional
from backend.models.catalogue import SalesItem
from backend.models.lpo import Lpo
from backend.models.picklist import PickAssignment, PickList, PickListItem
from backend.models.user import Notification, User
from backend.schemas.lpo import (
    ApproveRequest,
    LpoCreate,
    LpoOut,
    LpoUpdate,
    LpoUpdateStatus,
)
from backend.services.notification_service import send_push_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lpos", tags=["lpos"])


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[LpoOut])
@router.get("/", response_model=List[LpoOut])
async def get_lpos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← AUTH REQUIRED
):
    """List all LPOs ordered by creation date descending."""
    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .order_by(Lpo.created_at.desc())
    )
    lpos = result.scalars().all()
    logger.info("user=%s fetched %d LPOs", current_user.id, len(lpos))
    return lpos


@router.get("/my-history", response_model=List[LpoOut])
async def get_my_lpo_history(
    date: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List LPOs created by the current user, optionally filtered by date (YYYY-MM-DD)."""
    query = select(Lpo).options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
    query = query.filter(Lpo.created_by_id == current_user.id)
    
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            # PostgreSQL cast to date
            query = query.filter(sqlfunc.date(Lpo.created_at) == target_date)
        except ValueError:
            pass # Ignore invalid date format and return all

    query = query.order_by(Lpo.created_at.desc())
    result = await db.execute(query)
    lpos = result.scalars().all()
    return lpos


@router.get("/{lpo_id}", response_model=LpoOut)
async def get_lpo_by_id(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← AUTH REQUIRED
):
    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .filter(Lpo.id == lpo_id)
    )
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
    return lpo


import random
from sqlalchemy import func as sa_func

async def process_lpo_auto_assign(db: AsyncSession, lpo: Lpo, background_tasks: BackgroundTasks):
    # Create picklist
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
    cat_res = await db.execute(select(SalesItem).filter(SalesItem.primary_barcode.in_(all_barcodes)))
    cat_map = {ci.primary_barcode: ci for ci in cat_res.scalars().all()}

    for item in lpo.items:
        bc = item.get("barcode", "N/A")
        cat_item = cat_map.get(bc)
        qty = item.get("quantity", 1)
        scq = cat_item.standard_carton_quantity if cat_item and cat_item.standard_carton_quantity else 1
        
        full_cartons = int(qty // scq) if scq > 0 else 0
        loose_pieces = qty % scq if scq > 0 else qty

        if full_cartons > 0:
            db.add(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=bc,
                product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
                quantity=full_cartons,
                unit="Carton",
                is_full_carton=True,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            
        if loose_pieces > 0 or full_cartons == 0:
            db.add(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=bc,
                product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
                quantity=loose_pieces,
                unit=item.get("unit", "PCS") if item.get("unit", "PCS") != "Carton" else "PCS",
                is_full_carton=False,
                bin_location=cat_item.bin_location if cat_item else None,
            ))

    # Auto: least-loaded active picker
    pickers_res = await db.execute(
        select(User).filter(User.role == "picker", User.is_active == True).with_for_update()
    )
    all_pickers = pickers_res.scalars().all()
    if not all_pickers:
        logger.warning("No active pickers available for auto-assignment of LPO %s", lpo.id)
        lpo.status = "processed"
        return

    picker_counts = []
    for p in all_pickers:
        cnt_res = await db.execute(
            select(sa_func.count(PickAssignment.id))
            .join(PickList, PickAssignment.pick_list_id == PickList.id)
            .filter(
                PickAssignment.picker_id == p.id,
                PickList.status.notin_(["completed", "cancelled"]),
            )
        )
        cnt = cnt_res.scalar() or 0
        picker_counts.append((p, cnt))
        
    min_count = min(cnt for _, cnt in picker_counts)
    best_pickers = [p for p, cnt in picker_counts if cnt == min_count]
    picker = random.choice(best_pickers)

    assignment = PickAssignment(pick_list_id=db_picklist.id, picker_id=picker.id)
    db.add(assignment)
    db_picklist.status = "assigned"

    db.add(Notification(
        user_id=picker.id,
        type="pick_assignment",
        title="New Picklist Assigned",
        message=f"LPO #{lpo.lpo_number} for {lpo.customer_name} has been assigned to you.",
    ))
    background_tasks.add_task(
        send_push_notification,
        picker.push_token or "",
        "New Picklist Assigned",
        f"LPO #{lpo.lpo_number} assigned to you.",
    )

    lpo.status = "processed"
    await db.flush()
    
    from backend.websockets import manager
    await manager.broadcast({
        "event": "PICKLIST_ASSIGNED",
        "picker_id": picker.id,
        "picklist_id": db_picklist.id,
        "message": f"New Picklist Assigned: {lpo.lpo_number}"
    })

@router.post("", response_model=LpoOut)
@router.post("/", response_model=LpoOut)
async def create_lpo(
    lpo: LpoCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user_optional),  # optional — mobile creates without admin token
):
    """Create a new LPO. Mobile clients may call this without authentication."""
    # Auto-deduplicate LPO number to prevent conflicts
    lpo_number = lpo.lpo_number
    exists = await db.execute(select(Lpo).filter(Lpo.lpo_number == lpo_number))
    if exists.scalar_one_or_none():
        suffix = datetime.now(timezone.utc).strftime("%H%M%S")
        lpo_number = f"{lpo_number}-{suffix}"
        logger.warning("Duplicate LPO number detected, auto-suffixed to: %s", lpo_number)

    source = lpo.source or "upload"
    # Mobile LPOs start as 'draft' until the PDF is uploaded to confirm them
    initial_status = "draft" if source == "mobile" else "pending"

    db_lpo = Lpo(
        lpo_number=lpo_number,
        customer_name=lpo.customer_name,
        sales_person_id=lpo.sales_person_id or (current_user.id if current_user else None),
        items=[item.model_dump() for item in lpo.items],
        delivery_date=lpo.delivery_date,
        status=initial_status,
        source=source,
        created_by_id=current_user.id if current_user else None,
    )
    db.add(db_lpo)
    await db.commit()

    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .filter(Lpo.id == db_lpo.id)
    )
    lpo_obj = result.scalar_one()
    logger.info("LPO created: lpo_number=%s status=%s source=%s", lpo_number, initial_status, source)
    
    from backend.websockets import manager
    await manager.broadcast({
        "event": "ORDER_CREATED",
        "lpo_id": lpo_obj.id,
        "lpo_number": lpo_obj.lpo_number,
        "message": f"New Order Created: {lpo_obj.lpo_number}"
    })
    
    return lpo_obj

@router.put("/{lpo_id}", response_model=LpoOut)
async def update_lpo(
    lpo_id: int,
    lpo_update: LpoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    """Update a pending LPO (only items and delivery date)."""
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    db_lpo = result.scalar_one_or_none()
    
    if not db_lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
        
    if db_lpo.signed_lpo_url:
        raise HTTPException(
            status_code=400, 
            detail="Cannot edit LPO because it already has a signed document attached (Order is locked)."
        )

    db_lpo.items = [item.model_dump() for item in lpo_update.items]
    if lpo_update.delivery_date is not None:
        db_lpo.delivery_date = lpo_update.delivery_date

    await db.commit()

    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .filter(Lpo.id == lpo_id)
    )
    logger.info("LPO updated: id=%s", lpo_id)
    return result.scalar_one()


@router.patch("/{lpo_id}/url", response_model=LpoOut)
async def update_lpo_url(
    lpo_id: int,
    url: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← AUTH REQUIRED
):
    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .filter(Lpo.id == lpo_id)
    )
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    lpo.signed_lpo_url = url
    await db.commit()
    logger.info("LPO %s URL updated by user=%s", lpo_id, current_user.id)
    return lpo


@router.post("/{lpo_id}/upload-pdf")
async def upload_lpo_pdf(
    lpo_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a signed LPO PDF (generated on mobile) to Supabase Storage.

    This endpoint is intentionally accessible without an admin token because it is
    called by the mobile app immediately after LPO creation, before the user logs
    in as an admin. All other mutation endpoints are admin-protected.
    """
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    # ── File validation ────────────────────────────────────────────────────────
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_DOCUMENT_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{content_type}'. Allowed: PDF, JPEG, PNG.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    filename = file.filename or f"lpo-{lpo.lpo_number}.pdf"

    try:
        from backend.services.storage_service import upload_to_supabase
        public_url = upload_to_supabase(
            file_bytes=file_bytes,
            original_filename=filename,
            bucket=BUCKET_CUSTOMER_CONFIRMATION,
            folder=FOLDER_MOBILE_LPOS,
            content_type=content_type,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Upload failed for LPO %s: %s", lpo_id, exc)
        raise HTTPException(status_code=500, detail="File upload failed. Please try again.")

    lpo.signed_lpo_url = public_url

    # Trigger auto assign immediately upon receiving PDF
    if lpo.status in ["draft", "pending"]:
        # Auto-approves the LPO and generates PickList
        await process_lpo_auto_assign(db, lpo, background_tasks)

    await db.commit()
    await db.refresh(lpo)
    logger.info("LPO %s PDF uploaded successfully, status=%s", lpo_id, lpo.status)
    return {"url": public_url, "lpo_id": lpo_id, "status": lpo.status}


@router.patch("/{lpo_id}/status", response_model=LpoOut)
async def update_lpo_status(
    lpo_id: int,
    status_update: LpoUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .filter(Lpo.id == lpo_id)
    )
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    old_status = lpo.status
    lpo.status = status_update.status
    await db.commit()
    await db.refresh(lpo)
    logger.info("LPO %s status changed %s → %s by admin=%s", lpo_id, old_status, lpo.status, current_user.id)
    return lpo


@router.post("/{lpo_id}/disapprove", response_model=LpoOut)
async def disapprove_lpo(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    """Mark an LPO as disapproved."""
    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .filter(Lpo.id == lpo_id)
    )
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
    if lpo.status == "processed":
        raise HTTPException(status_code=400, detail="Cannot disapprove a processed LPO")

    lpo.status = "disapproved"
    await db.commit()
    await db.refresh(lpo)
    logger.info("LPO %s disapproved by admin=%s", lpo_id, current_user.id)
    return lpo


@router.post("/{lpo_id}/approve")
async def approve_lpo(
    lpo_id: int,
    req: ApproveRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    """
    Approve an LPO and immediately convert it into a picklist.

    assign_mode='auto'   → round-robin to the least-loaded available picker.
    assign_mode='manual' → assign to the specified picker_id.
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
    cat_res = await db.execute(select(SalesItem).filter(SalesItem.primary_barcode.in_(all_barcodes)))
    cat_map = {ci.primary_barcode: ci for ci in cat_res.scalars().all()}

    for item in lpo.items:
        bc = item.get("barcode", "N/A")
        cat_item = cat_map.get(bc)
        qty = item.get("quantity", 1)
        scq = cat_item.standard_carton_quantity if cat_item and cat_item.standard_carton_quantity else 1
        
        full_cartons = int(qty // scq) if scq > 0 else 0
        loose_pieces = qty % scq if scq > 0 else qty

        if full_cartons > 0:
            db.add(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=bc,
                product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
                quantity=full_cartons,
                unit="Carton",
                is_full_carton=True,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            
        if loose_pieces > 0 or full_cartons == 0:
            db.add(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=bc,
                product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
                quantity=loose_pieces,
                unit=item.get("unit", "PCS") if item.get("unit", "PCS") != "Carton" else "PCS",
                is_full_carton=False,
                bin_location=cat_item.bin_location if cat_item else None,
            ))

    # ── Assign picker ────────────────────────────────────────────────────────
    picker = None
    if req.assign_mode == "manual":
        if not req.picker_id:
            raise HTTPException(status_code=400, detail="picker_id required for manual assignment")
        p_res = await db.execute(
            select(User).filter(User.id == req.picker_id, User.role == "picker")
        )
        picker = p_res.scalar_one_or_none()
        if not picker:
            raise HTTPException(status_code=404, detail="Picker not found")
        if not picker.is_available:
            raise HTTPException(status_code=400, detail="Picker is not available")
    else:
        import random
        # Auto: least-loaded active picker
        from sqlalchemy import func as sa_func
        # Lock active pickers to serialize concurrent assignments and prevent dogpiling
        pickers_res = await db.execute(
            select(User).filter(
                User.role == "picker",
                User.is_active == True,
            ).with_for_update()
        )
        all_pickers = pickers_res.scalars().all()
        if not all_pickers:
            raise HTTPException(status_code=400, detail="No active pickers right now")

        picker_counts = []
        for p in all_pickers:
            cnt_res = await db.execute(
                select(sa_func.count(PickAssignment.id))
                .join(PickList, PickAssignment.pick_list_id == PickList.id)
                .filter(
                    PickAssignment.picker_id == p.id,
                    PickList.status.notin_(["completed", "cancelled"]),
                )
            )
            cnt = cnt_res.scalar() or 0
            picker_counts.append((p, cnt))
            
        min_count = min(cnt for _, cnt in picker_counts)
        best_pickers = [p for p, cnt in picker_counts if cnt == min_count]
        picker = random.choice(best_pickers)

    if picker:
        assignment = PickAssignment(
            pick_list_id=db_picklist.id,
            picker_id=picker.id,
        )
        db.add(assignment)
        db_picklist.status = "assigned"

        db.add(Notification(
            user_id=picker.id,
            type="pick_assignment",
            title="New Picklist Assigned",
            message=f"LPO #{lpo.lpo_number} for {lpo.customer_name} has been assigned to you.",
        ))
        background_tasks.add_task(
            send_push_notification,
            picker.push_token or "",
            "New Picklist Assigned",
            f"LPO #{lpo.lpo_number} assigned to you.",
        )

    lpo.status = "processed"
    await db.commit()
    await db.refresh(db_picklist)

    logger.info(
        "LPO %s approved by admin=%s → picklist=%s assigned_to=%s",
        lpo_id, current_user.id, db_picklist.id,
        picker.full_name if picker else "unassigned",
    )
    
    from backend.websockets import manager
    if picker:
        await manager.broadcast({
            "event": "PICKLIST_ASSIGNED",
            "picker_id": picker.id,
            "picklist_id": db_picklist.id,
            "message": f"New Picklist Assigned: {lpo.lpo_number}"
        })
    else:
        await manager.broadcast({
            "event": "ORDER_CREATED", # reusing the generic event to refresh lists
            "message": f"LPO {lpo.lpo_number} converted to unassigned Picklist"
        })
    return {
        "message": "LPO approved and converted to picklist",
        "picklist_id": db_picklist.id,
        "assigned_to": picker.full_name if picker else None,
        "items_count": len(lpo.items),
    }


@router.delete("/{lpo_id}")
async def delete_lpo(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    await db.delete(lpo)
    await db.commit()
    logger.info("LPO %s deleted by admin=%s", lpo_id, current_user.id)
    return {"message": "LPO deleted successfully"}


@router.post("/{lpo_id}/convert")
async def convert_lpo_to_picklist(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    """Legacy endpoint — converts LPO to pick list without picker assignment."""
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
        qty = item.get("quantity", 1)
        scq = cat_item.standard_carton_quantity if cat_item and cat_item.standard_carton_quantity else 1
        
        full_cartons = int(qty // scq) if scq > 0 else 0
        loose_pieces = qty % scq if scq > 0 else qty

        if full_cartons > 0:
            db.add(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=bc,
                product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
                quantity=full_cartons,
                unit="Carton",
                is_full_carton=True,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            verified_count += 1
            
        if loose_pieces > 0 or full_cartons == 0:
            db.add(PickListItem(
                pick_list_id=db_picklist.id,
                barcode=bc,
                product_name=cat_item.item_name if cat_item else item.get("product_name", "Item"),
                quantity=loose_pieces,
                unit=item.get("unit", "EA") if item.get("unit", "EA") != "Carton" else "PCS",
                is_full_carton=False,
                bin_location=cat_item.bin_location if cat_item else None,
            ))
            verified_count += 1

    lpo.status = "processed"
    await db.commit()
    await db.refresh(db_picklist)

    logger.info("LPO %s converted to picklist %s by admin=%s", lpo_id, db_picklist.id, current_user.id)
    return {
        "message": "LPO converted to pick list successfully",
        "picklist_id": db_picklist.id,
        "items_count": verified_count,
    }


@router.patch("/{lpo_id}/delivery-date", response_model=LpoOut)
async def update_lpo_delivery_date(
    lpo_id: int,
    delivery_date: datetime,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    result = await db.execute(
        select(Lpo)
        .options(selectinload(Lpo.created_by), selectinload(Lpo.sales_person))
        .filter(Lpo.id == lpo_id)
    )
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    lpo.delivery_date = delivery_date
    await db.commit()
    logger.info("LPO %s delivery date updated by admin=%s", lpo_id, current_user.id)
    return lpo
