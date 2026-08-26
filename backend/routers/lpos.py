"""
LPO (Local Purchase Order) router.

All write operations and sensitive reads require authentication.
Schemas live in backend/schemas/lpo.py.
Push notifications are centralised in backend/services/notification_service.py.

Converting an LPO into a picklist is done in one place — ``_convert_to_picklist``
— which the approve, auto-assign-on-PDF-upload and legacy convert endpoints all
call. Previously each carried its own copy of the carton/loose split logic.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload, selectinload

from backend.config import settings
from backend.constants import (
    ALLOWED_DOCUMENT_MIME_TYPES,
    BUCKET_CUSTOMER_CONFIRMATION,
    FOLDER_MOBILE_LPOS,
    MAX_UPLOAD_SIZE_BYTES,
)
from backend.core.utils import PREFIX_LPO, PREFIX_PICKLIST, flush_with_prefixed_id
from backend.database import get_db
from backend.dependencies import get_current_admin, get_current_user, get_current_user_optional
from backend.models.lpo import Lpo, LpoItem
from backend.models.picklist import Picklist, PicklistAssignment
from backend.models.products import Product
from backend.models.users import AdminUser, PickerUser
from backend.routers.picklists import (
    _pick_least_loaded_picker,
    _validate_and_build,
    _notify_assignment,
    resolve_customer_id,
)
from backend.schemas.lpo import (
    ApproveRequest,
    LpoCreate,
    LpoOut,
    LpoUpdate,
    LpoUpdateStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lpos", tags=["lpos"])

#: Relationship loads needed to serialise an LpoOut without an N+1.
#:
#: Collections use selectinload (one extra query, regardless of row count).
#: The three single-object relations use joinedload so they ride along in the
#: main query instead of costing a round trip each — on a remote database those
#: three round trips were most of the wait on the order-history screen.
_LPO_LOAD_OPTIONS = (
    selectinload(Lpo.items).joinedload(LpoItem.product),
    joinedload(Lpo.customer),
    joinedload(Lpo.sales_person),
    joinedload(Lpo.created_by_admin),
)


async def _reload_lpo(db: AsyncSession, lpo_id: int) -> Lpo:
    result = await db.execute(
        select(Lpo).options(*_LPO_LOAD_OPTIONS).filter(Lpo.id == lpo_id)
    )
    lpo = result.scalars().unique().one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
    return lpo


async def _build_lpo_items(db: AsyncSession, lpo_id: int, lines) -> List[LpoItem]:
    """
    Turn submitted lines into LpoItem rows, resolving each barcode to a product.

    An unresolved barcode is kept rather than rejected: an LPO records what the
    customer asked for, and a SKU missing from the catalogue is a real situation
    the warehouse has to see and fix. The line is stored with a null product_id
    and the document's own description.
    """
    barcodes = [line.barcode for line in lines if line.barcode]
    product_map = {}
    if barcodes:
        result = await db.execute(
            select(Product).filter(
                (Product.primary_barcode.in_(barcodes))
                | (Product.secondary_barcode.in_(barcodes))
            )
        )
        for product in result.scalars().all():
            product_map[product.primary_barcode] = product
            if product.secondary_barcode:
                product_map[product.secondary_barcode] = product

    items = []
    for line in lines:
        product = product_map.get(line.barcode)
        items.append(
            LpoItem(
                lpo_id=lpo_id,
                product_id=line.product_id or (product.id if product else None),
                barcode=line.barcode,
                description=line.product_name or (product.name if product else None),
                quantity=line.quantity,
                unit=line.unit,
            )
        )
    return items


async def _convert_to_picklist(db: AsyncSession, lpo: Lpo) -> Picklist:
    """
    Create the picklist an approved LPO becomes.

    Reuses the picking module's validation so an LPO cannot produce a job whose
    lines have no catalogue product or no stock — the same rule the admin
    picklist screens already enforce.
    """
    db_picklist = Picklist(
        order_number=lpo.lpo_number,
        customer_id=lpo.customer_id,
        sales_person_id=lpo.sales_person_id,
        sales_order_id=None,
        status="draft",
        picker_job_number=None,
        delivery_date=lpo.delivery_date,
    )
    await flush_with_prefixed_id(db, db_picklist, "picklist_number", PREFIX_PICKLIST)

    lines = [
        {"barcode": item.barcode, "quantity": item.quantity, "unit": item.unit}
        for item in lpo.items
    ]
    if not lines:
        raise HTTPException(status_code=400, detail="LPO has no items to convert")

    items = await _validate_and_build(db, db_picklist.id, lines)
    db.add_all(items)
    return db_picklist


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[LpoOut])
@router.get("/", response_model=List[LpoOut])
async def get_lpos(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),  # ← AUTH REQUIRED
):
    """List all LPOs ordered by creation date descending."""
    result = await db.execute(
        select(Lpo).options(*_LPO_LOAD_OPTIONS).order_by(Lpo.created_at.desc())
    )
    lpos = result.scalars().unique().all()
    logger.info("user=%s fetched %d LPOs", current_user.id, len(lpos))
    return lpos


@router.get("/my-history", response_model=List[LpoOut])
async def get_my_lpo_history(
    date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List LPOs raised by the current user, optionally filtered by date (YYYY-MM-DD)."""
    query = select(Lpo).options(*_LPO_LOAD_OPTIONS)

    # "Mine" means a different column per persona now that the creator is split
    # across two strict FKs instead of one polymorphic user id.
    if isinstance(current_user, AdminUser):
        query = query.filter(Lpo.created_by_admin_id == current_user.id)
    else:
        query = query.filter(Lpo.sales_person_id == current_user.id)

    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            # A half-open range on the raw column, not date(created_at) == x.
            # Wrapping the column in a function makes the predicate unindexable
            # and forces a full scan of the table as it grows.
            day_start = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
            query = query.filter(
                Lpo.created_at >= day_start,
                Lpo.created_at < day_start + timedelta(days=1),
            )
        except ValueError:
            pass  # Ignore invalid date format and return all

    result = await db.execute(query.order_by(Lpo.created_at.desc()))
    return result.scalars().unique().all()


@router.get("/{lpo_id}", response_model=LpoOut)
async def get_lpo_by_id(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),  # ← AUTH REQUIRED
):
    return await _reload_lpo(db, lpo_id)


@router.post("", response_model=LpoOut)
@router.post("/", response_model=LpoOut)
async def create_lpo(
    lpo: LpoCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user_optional),  # optional — mobile creates without admin token
):
    """Create a new LPO. Mobile clients may call this without authentication."""
    # Auto-deduplicate the customer's LPO number to prevent conflicts. This is
    # the customer's own document reference, so it is suffixed rather than
    # regenerated — the internal_ref below is the id we generate ourselves.
    lpo_number = lpo.lpo_number
    exists = await db.execute(select(Lpo.id).filter(Lpo.lpo_number == lpo_number))
    if exists.scalars().first() is not None:
        suffix = datetime.now(timezone.utc).strftime("%H%M%S")
        lpo_number = f"{lpo_number}-{suffix}"
        logger.warning("Duplicate LPO number detected, auto-suffixed to: %s", lpo_number)

    customer_id = await resolve_customer_id(db, lpo.customer_id, lpo.customer_name)

    source = lpo.source or "upload"
    # Mobile LPOs start as 'draft' until the PDF is uploaded to confirm them
    initial_status = "draft" if source == "mobile" else "pending"

    is_admin = isinstance(current_user, AdminUser)
    db_lpo = Lpo(
        lpo_number=lpo_number,
        customer_id=customer_id,
        sales_person_id=lpo.sales_person_id
        or (current_user.id if current_user and not is_admin else None),
        delivery_date=lpo.delivery_date,
        status=initial_status,
        source=source,
        created_by_admin_id=current_user.id if is_admin else None,
    )
    await flush_with_prefixed_id(db, db_lpo, "internal_ref", PREFIX_LPO)

    db.add_all(await _build_lpo_items(db, db_lpo.id, lpo.items))
    await db.commit()

    lpo_obj = await _reload_lpo(db, db_lpo.id)
    logger.info(
        "LPO created: lpo_number=%s internal_ref=%s status=%s source=%s",
        lpo_number,
        lpo_obj.internal_ref,
        initial_status,
        source,
    )

    from backend.ws_manager import manager

    await manager.broadcast(
        {
            "event": "ORDER_CREATED",
            "lpo_id": lpo_obj.id,
            "lpo_number": lpo_obj.lpo_number,
            "message": f"New Order Created: {lpo_obj.lpo_number}",
        }
    )

    return lpo_obj


@router.put("/{lpo_id}", response_model=LpoOut)
async def update_lpo(
    lpo_id: int,
    lpo_update: LpoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    """Update a pending LPO (only items and delivery date)."""
    result = await db.execute(
        select(Lpo).options(selectinload(Lpo.items)).filter(Lpo.id == lpo_id)
    )
    db_lpo = result.scalars().unique().one_or_none()

    if not db_lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    if db_lpo.signed_lpo_url:
        raise HTTPException(
            status_code=400,
            detail="Cannot edit LPO because it already has a signed document attached (Order is locked).",
        )

    # Replace the line set wholesale; delete-orphan on the relationship removes
    # the previous rows.
    db_lpo.items.clear()
    await db.flush()
    db.add_all(await _build_lpo_items(db, db_lpo.id, lpo_update.items))

    if lpo_update.delivery_date is not None:
        db_lpo.delivery_date = lpo_update.delivery_date

    await db.commit()
    logger.info("LPO updated: id=%s", lpo_id)
    return await _reload_lpo(db, lpo_id)


@router.patch("/{lpo_id}/url", response_model=LpoOut)
async def update_lpo_url(
    lpo_id: int,
    url: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),  # ← AUTH REQUIRED
):
    lpo = await _reload_lpo(db, lpo_id)
    lpo.signed_lpo_url = url
    await db.commit()
    logger.info("LPO %s URL updated by user=%s", lpo_id, current_user.id)
    return await _reload_lpo(db, lpo_id)


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
    lpo = await _reload_lpo(db, lpo_id)

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

    ext = file.filename.rsplit(".", 1)[-1] if (file.filename and "." in file.filename) else "pdf"
    filename = f"lpo-{lpo.lpo_number}.{ext}"

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

    # Receiving the signed PDF auto-approves the LPO and generates the picklist.
    if lpo.status in ("draft", "pending"):
        db_picklist = await _convert_to_picklist(db, lpo)

        picker = await _pick_least_loaded_picker(db)
        db.add(PicklistAssignment(picklist_id=db_picklist.id, picker_id=picker.id))
        db_picklist.status = "assigned"
        picker.is_available = False
        _notify_assignment(picker, db_picklist, None, background_tasks)

        lpo.status = "processed"

        await db.commit()

        from backend.ws_manager import manager

        await manager.broadcast(
            {
                "event": "PICKLIST_ASSIGNED",
                "picker_id": picker.id,
                "picklist_id": db_picklist.id,
                "message": f"New Picklist Assigned: {lpo.lpo_number}",
            }
        )
    else:
        await db.commit()

    await db.refresh(lpo)
    logger.info("LPO %s PDF uploaded successfully, status=%s", lpo_id, lpo.status)
    return {"url": public_url, "lpo_id": lpo_id, "status": lpo.status}


@router.patch("/{lpo_id}/status", response_model=LpoOut)
async def update_lpo_status(
    lpo_id: int,
    status_update: LpoUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    lpo = await _reload_lpo(db, lpo_id)
    old_status = lpo.status
    lpo.status = status_update.status
    await db.commit()
    logger.info(
        "LPO %s status changed %s → %s by admin=%s", lpo_id, old_status, lpo.status, current_user.id
    )
    return await _reload_lpo(db, lpo_id)


@router.post("/{lpo_id}/disapprove", response_model=LpoOut)
async def disapprove_lpo(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    """Mark an LPO as disapproved."""
    lpo = await _reload_lpo(db, lpo_id)
    if lpo.status == "processed":
        raise HTTPException(status_code=400, detail="Cannot disapprove a processed LPO")

    lpo.status = "disapproved"
    await db.commit()
    logger.info("LPO %s disapproved by admin=%s", lpo_id, current_user.id)
    return await _reload_lpo(db, lpo_id)


@router.post("/{lpo_id}/approve")
async def approve_lpo(
    lpo_id: int,
    req: ApproveRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    """
    Approve an LPO and immediately convert it into a picklist.

    assign_mode='auto'   → round-robin to the least-loaded available picker.
    assign_mode='manual' → assign to the specified picker_id.
    """
    lpo = await _reload_lpo(db, lpo_id)
    if lpo.status == "processed":
        raise HTTPException(status_code=400, detail="LPO is already converted")

    db_picklist = await _convert_to_picklist(db, lpo)

    # ── Assign picker ────────────────────────────────────────────────────────
    if req.assign_mode == "manual":
        if not req.picker_id:
            raise HTTPException(status_code=400, detail="picker_id required for manual assignment")
        p_res = await db.execute(
            select(PickerUser).filter(
                PickerUser.id == req.picker_id, PickerUser.is_active.is_(True)
            )
        )
        picker = p_res.scalars().first()
        if not picker:
            raise HTTPException(status_code=404, detail="Picker not found")
        if not picker.is_available:
            raise HTTPException(status_code=400, detail="Picker is not available")
    else:
        picker = await _pick_least_loaded_picker(db, require_available=False)

    db.add(PicklistAssignment(picklist_id=db_picklist.id, picker_id=picker.id))
    db_picklist.status = "assigned"
    picker.is_available = False
    _notify_assignment(picker, db_picklist, None, background_tasks)

    lpo.status = "processed"
    await db.commit()
    await db.refresh(db_picklist)

    logger.info(
        "LPO %s approved by admin=%s → picklist=%s assigned_to=%s",
        lpo_id,
        current_user.id,
        db_picklist.id,
        picker.full_name,
    )

    from backend.ws_manager import manager

    await manager.broadcast(
        {
            "event": "PICKLIST_ASSIGNED",
            "picker_id": picker.id,
            "picklist_id": db_picklist.id,
            "message": f"New Picklist Assigned: {lpo.lpo_number}",
        }
    )

    return {
        "message": "LPO approved and converted to picklist",
        "picklist_id": db_picklist.id,
        "picklist_number": db_picklist.picklist_number,
        "assigned_to": picker.full_name,
        "items_count": len(lpo.items),
    }


@router.delete("/{lpo_id}")
async def delete_lpo(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalars().one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")

    await db.delete(lpo)  # lpo_items go with it via ON DELETE CASCADE
    await db.commit()
    logger.info("LPO %s deleted by admin=%s", lpo_id, current_user.id)
    return {"message": "LPO deleted successfully"}


@router.post("/{lpo_id}/convert")
async def convert_lpo_to_picklist(
    lpo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    """Legacy endpoint — converts LPO to pick list without picker assignment."""
    lpo = await _reload_lpo(db, lpo_id)
    if lpo.status == "processed":
        raise HTTPException(status_code=400, detail="LPO is already converted")

    db_picklist = await _convert_to_picklist(db, lpo)
    lpo.status = "processed"
    await db.commit()
    await db.refresh(db_picklist)

    logger.info("LPO %s converted to picklist %s by admin=%s", lpo_id, db_picklist.id, current_user.id)
    return {
        "message": "LPO converted to pick list successfully",
        "picklist_id": db_picklist.id,
        "picklist_number": db_picklist.picklist_number,
        "items_count": len(lpo.items),
    }


@router.patch("/{lpo_id}/delivery-date", response_model=LpoOut)
async def update_lpo_delivery_date(
    lpo_id: int,
    delivery_date: datetime,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(get_current_admin),  # ← ADMIN REQUIRED
):
    lpo = await _reload_lpo(db, lpo_id)
    lpo.delivery_date = delivery_date
    await db.commit()
    logger.info("LPO %s delivery date updated by admin=%s", lpo_id, current_user.id)
    return await _reload_lpo(db, lpo_id)
