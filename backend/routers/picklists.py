"""
Picking router.

Four endpoints used to build a picklist from a list of ordered lines, each with
its own near-identical copy of the barcode lookup, stock validation and
carton/loose split. They now share ``_validate_and_build`` — the split rule lives
in one place, so a change to it cannot reach three call sites and miss the fourth.
"""
import asyncio
import io
import logging
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, model_validator
from sqlalchemy import case, desc
from sqlalchemy import func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.constants import ACTIVE_PICK_STATUSES, DEFAULT_UNIT, WEIGHT_TOLERANCE_FRACTION
from backend.core.utils import PREFIX_PICKLIST, flush_with_prefixed_id
from backend.database import get_db
from backend.dependencies import get_current_admin, get_current_picker, get_current_user
from backend.models.customer import Customer
from backend.models.order import SalesOrder
from backend.models.picklist import (
    Picklist,
    PicklistAssignment,
    PicklistBox,
    PicklistBoxItem,
    PicklistItem,
)
from backend.models.products import CartonType, Product
from backend.models.users import PickerUser
from backend.schemas.picklist import (
    PicklistBoxCreate,
    PicklistBoxOut,
    PicklistOut,
    SealBoxCreate,
)
from backend.services.excel_service import generate_branded_picklist_excel, generate_picklist_excel
from backend.services.notification_service import send_push_notification
from backend.services.pdf_generator import generate_picklist_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/picklists", tags=["picklists"])


# ─── Inline schemas not yet in schemas package ────────────────────────────────

class DirectAssignItem(BaseModel):
    barcode: str
    quantity: float
    unit: str = DEFAULT_UNIT
    product_name: Optional[str] = None


class DirectAssignRequest(BaseModel):
    order_number: str
    items: List[DirectAssignItem]
    # Send customer_id; customer_name is accepted as a fallback and resolved
    # against the customers table.
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    auto_assign: bool = True
    sales_person_id: Optional[int] = None
    delivery_date: Optional[datetime] = None

    @model_validator(mode="after")
    def _require_a_customer(self):
        if self.customer_id is None and not (self.customer_name or "").strip():
            raise ValueError("Either customer_id or customer_name is required")
        return self


def trigger_push(
    push_token: Optional[str],
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


# ─── Shared building blocks ───────────────────────────────────────────────────

_PICKLIST_LOAD_OPTIONS = (
    selectinload(Picklist.items).joinedload(PicklistItem.product),
    selectinload(Picklist.boxes),
    selectinload(Picklist.assignments).joinedload(PicklistAssignment.picker),
)


async def resolve_customer_id(
    db: AsyncSession,
    customer_id: Optional[int],
    customer_name: Optional[str],
) -> int:
    """
    Turn whatever the client sent into a customers.id.

    Clients pick from the /customers list but historically posted the name; both
    are accepted here so the strict FK does not force a simultaneous client
    release. An unknown name is a 400 rather than a silently created customer —
    the customer master is admin-managed and must not grow by typo.
    """
    if customer_id is not None:
        result = await db.execute(select(Customer.id).filter(Customer.id == customer_id))
        if result.scalars().first() is None:
            raise HTTPException(status_code=400, detail=f"Customer {customer_id} does not exist")
        return customer_id

    name = (customer_name or "").strip()
    result = await db.execute(select(Customer).filter(Customer.name.ilike(name)))
    customer = result.scalars().first()
    if customer is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown customer '{name}'. Add them in Customer Master first.",
        )
    return customer.id


async def _load_products_by_barcode(
    db: AsyncSession, barcodes: Sequence[str]
) -> Dict[str, Product]:
    """
    Map every barcode in ``barcodes`` to its product.

    A product is reachable by either of its two barcodes, so both are indexed
    into the returned map. One query, no N+1.
    """
    wanted = [b for b in barcodes if b]
    if not wanted:
        return {}
    result = await db.execute(
        select(Product).filter(
            (Product.primary_barcode.in_(wanted)) | (Product.secondary_barcode.in_(wanted))
        )
    )
    product_map: Dict[str, Product] = {}
    for product in result.scalars().all():
        product_map[product.primary_barcode] = product
        if product.secondary_barcode:
            product_map[product.secondary_barcode] = product
    return product_map


def _stock_errors(lines: Sequence[Any], product_map: Dict[str, Product]) -> List[Dict[str, str]]:
    """
    Check requested quantities against available stock.

    A barcode with no catalogue match has no stock and fails here, which is what
    keeps ``PicklistItem.product_id`` satisfiable: nothing reaches the insert
    without a resolved product.
    """
    errors = []
    for line in lines:
        barcode = line["barcode"]
        product = product_map.get(barcode)
        available = product.available_quantity if product else 0
        if product is None:
            errors.append(
                {"barcode": barcode, "error": "Item is not in the catalogue. Add it first."}
            )
        elif available == 0:
            errors.append(
                {
                    "barcode": barcode,
                    "error": (
                        "Item is out of stock. Please restock in the Sales Catalogue "
                        "or remove it from the order."
                    ),
                }
            )
        elif line["quantity"] > available:
            errors.append(
                {
                    "barcode": barcode,
                    "error": (
                        f"Only {available} units available in stock. "
                        "Please adjust the requested quantity."
                    ),
                }
            )
    return errors


def _build_picklist_items(
    picklist_id: int,
    lines: Sequence[Dict[str, Any]],
    product_map: Dict[str, Product],
) -> List[PicklistItem]:
    """
    Split each ordered line into the rows a picker actually walks.

    A quantity is divided by the product's standard carton quantity: the whole
    cartons become one row scanned against the *primary* barcode, the remainder
    becomes a loose row scanned against the *secondary* barcode. That is why
    ``PicklistItem`` stores a barcode alongside ``product_id`` — the two rows
    point at the same product but must be scanned differently.
    """
    items: List[PicklistItem] = []
    for line in lines:
        product = product_map[line["barcode"]]
        quantity = line["quantity"]
        per_carton = product.standard_carton_quantity or 1

        full_cartons = int(quantity // per_carton) if per_carton > 0 else 0
        loose_pieces = quantity % per_carton if per_carton > 0 else quantity

        if full_cartons > 0:
            items.append(
                PicklistItem(
                    picklist_id=picklist_id,
                    product_id=product.id,
                    barcode=product.primary_barcode,
                    quantity=full_cartons,
                    unit="Carton",
                    is_full_carton=True,
                    bin_location=product.bin_location,
                )
            )

        if loose_pieces > 0 or full_cartons == 0:
            items.append(
                PicklistItem(
                    picklist_id=picklist_id,
                    product_id=product.id,
                    barcode=product.secondary_barcode or product.primary_barcode,
                    quantity=loose_pieces,
                    unit=line.get("unit") or product.unit or DEFAULT_UNIT,
                    is_full_carton=False,
                    bin_location=product.bin_location,
                )
            )
    return items


async def _validate_and_build(
    db: AsyncSession,
    picklist_id: int,
    lines: Sequence[Dict[str, Any]],
) -> List[PicklistItem]:
    """Resolve products, reject unpickable lines, and build the picklist rows."""
    product_map = await _load_products_by_barcode(db, [line["barcode"] for line in lines])

    errors = _stock_errors(lines, product_map)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Inventory validation failed", "errors": errors},
        )

    items = _build_picklist_items(picklist_id, lines, product_map)
    if not items:
        raise HTTPException(
            status_code=400,
            detail={"message": "Cannot create pick list: no items attached to order.", "errors": []},
        )
    return items


async def _next_job_number(db: AsyncSession, picker_id: int) -> int:
    """Per-picker job sequence — max active job number for this picker plus one."""
    result = await db.execute(
        select(sqlfunc.max(Picklist.picker_job_number))
        .join(PicklistAssignment, PicklistAssignment.picklist_id == Picklist.id)
        .filter(
            PicklistAssignment.picker_id == picker_id,
            Picklist.status.in_(ACTIVE_PICK_STATUSES),
        )
    )
    return (result.scalar() or 0) + 1


async def _pick_least_loaded_picker(
    db: AsyncSession, require_available: bool = True
) -> PickerUser:
    """
    Choose the active picker with the fewest in-flight jobs, breaking ties at random.

    The candidate rows are locked FOR UPDATE so two concurrent assignments cannot
    read the same load figures and dogpile the same person.
    """
    stmt = select(PickerUser).filter(PickerUser.is_active.is_(True))
    if require_available:
        stmt = stmt.filter(PickerUser.is_available.is_(True))
    result = await db.execute(stmt.with_for_update())
    candidates = result.scalars().all()
    if not candidates:
        raise HTTPException(status_code=400, detail="No available pickers right now")

    # One grouped COUNT for the whole pool. This used to be a COUNT per picker,
    # which on a remote database meant the assignment latency grew linearly with
    # how many staff were on shift — exactly backwards.
    load_rows = await db.execute(
        select(
            PicklistAssignment.picker_id,
            sqlfunc.count(PicklistAssignment.id),
        )
        .join(Picklist, PicklistAssignment.picklist_id == Picklist.id)
        .filter(
            PicklistAssignment.picker_id.in_([c.id for c in candidates]),
            Picklist.status.in_(ACTIVE_PICK_STATUSES),
        )
        .group_by(PicklistAssignment.picker_id)
    )
    # Pickers with no active jobs are absent from the GROUP BY and default to 0.
    by_picker = {picker_id: total for picker_id, total in load_rows.all()}

    loads = [(by_picker.get(c.id, 0), c) for c in candidates]
    min_load = min(load for load, _ in loads)
    return random.choice([picker for load, picker in loads if load == min_load])


def _notify_assignment(
    picker: PickerUser,
    picklist: Picklist,
    job_label: Optional[str],
    background_tasks: Optional[BackgroundTasks],
) -> None:
    """
    Schedule the device push for a newly assigned job.

    There is no longer an in-app notification table — live updates go over the
    WebSocket. Push is still sent here because it has to reach a device whose
    app is closed, which a socket cannot do. Callers pair this with
    ``broadcast_event`` *after* their commit.
    """
    title = f"New Job Assigned: {job_label}" if job_label else "New Pick List Assigned"
    message = (
        f"Job {job_label} (Order #{picklist.order_number}) has been routed to your terminal."
        if job_label
        else f"Order #{picklist.order_number} has been assigned to you."
    )
    trigger_push(picker.push_token, title, message, background_tasks=background_tasks)


async def broadcast_event(event: str, **payload) -> None:
    """
    Push a live update to every connected client.

    Always call this *after* the transaction commits: the socket message tells
    clients to refetch, and refetching before the commit lands would return the
    pre-change state.
    """
    from backend.ws_manager import manager

    await manager.broadcast({"event": event, **payload})


async def broadcast_progress(picklist_id: int) -> None:
    """
    Announce an item- or box-level change inside one job.

    Kept separate from the job-level events on purpose: this fires once per
    scan, so only the client that has *this* picklist open reacts to it. The
    picklist list view stays on its own refresh cadence rather than reloading
    every row each time a picker ticks off an item.
    """
    await broadcast_event("PICKLIST_PROGRESS", picklist_id=picklist_id)


# ─── Reads ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[PicklistOut])
@router.get("/", response_model=List[PicklistOut])
async def list_picklists(
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    q = select(Picklist).options(*_PICKLIST_LOAD_OPTIONS)
    if status:
        q = q.filter(Picklist.status == status)
    if search:
        # customer_name is no longer a column, so the text search joins the
        # customer master instead of matching a copied string.
        q = q.join(Customer, Picklist.customer_id == Customer.id).filter(
            (Picklist.order_number.ilike(f"%{search}%"))
            | (Picklist.picklist_number.ilike(f"%{search}%"))
            | (Customer.name.ilike(f"%{search}%"))
        )
    result = await db.execute(q.order_by(desc(Picklist.created_at)))
    return result.scalars().all()


@router.get("/my/summary")
async def my_picklists_summary(
    db: AsyncSession = Depends(get_db),
    current_picker: PickerUser = Depends(get_current_picker),
):
    """
    The picker's job list, aggregated server-side.

    The jobs screen only ever showed a count, a progress figure and a bin range,
    but it was fetching every item, box, box-item and product of every open job
    to compute them on the phone. On a large order that is a payload measured in
    hundreds of kilobytes over a mobile connection, parsed on a low-end device,
    to render six numbers.

    This is one query returning one row per job. Use GET /picklists/{id} for the
    full detail when the picker actually opens a job.
    """
    picked_case = case((PicklistItem.is_picked.is_(True), 1))

    # Correlated scalar subqueries rather than extra joins: joining boxes as well
    # as items would multiply the rows and corrupt every count in the SELECT.
    unaudited_boxes = (
        select(sqlfunc.count(PicklistBox.id))
        .where(PicklistBox.picklist_id == Picklist.id, PicklistBox.is_audited.is_(False))
        .correlate(Picklist)
        .scalar_subquery()
    )
    total_boxes = (
        select(sqlfunc.count(PicklistBox.id))
        .where(PicklistBox.picklist_id == Picklist.id)
        .correlate(Picklist)
        .scalar_subquery()
    )

    result = await db.execute(
        select(
            Picklist.id,
            Picklist.picklist_number,
            Picklist.order_number,
            Picklist.status,
            Picklist.picker_job_number,
            Picklist.delivery_date,
            Picklist.created_at,
            Customer.name.label("customer_name"),
            sqlfunc.count(PicklistItem.id).label("total_items"),
            sqlfunc.count(picked_case).label("picked_items"),
            sqlfunc.count(case((PicklistItem.is_audited.is_(False), 1))).label("unaudited_items"),
            unaudited_boxes.label("unaudited_boxes"),
            total_boxes.label("total_boxes"),
            sqlfunc.min(PicklistItem.bin_location).label("start_bin"),
            sqlfunc.max(PicklistItem.bin_location).label("end_bin"),
        )
        .join(PicklistAssignment, PicklistAssignment.picklist_id == Picklist.id)
        .join(Customer, Customer.id == Picklist.customer_id)
        .outerjoin(PicklistItem, PicklistItem.picklist_id == Picklist.id)
        .filter(
            PicklistAssignment.picker_id == current_picker.id,
            Picklist.status.in_(ACTIVE_PICK_STATUSES),
        )
        .group_by(Picklist.id, Customer.name)
        .order_by(desc(Picklist.created_at))
    )

    return [
        {
            "id": row.id,
            "picklist_number": row.picklist_number,
            "order_number": row.order_number,
            "customer_name": row.customer_name,
            "status": row.status,
            "picker_job_number": row.picker_job_number,
            "delivery_date": row.delivery_date,
            "created_at": row.created_at,
            "total_items": row.total_items,
            "picked_items": row.picked_items,
            "start_bin": row.start_bin,
            "end_bin": row.end_bin,
            # Lets the app decide whether an earlier job still blocks this
            # picker, without downloading that job's items and boxes to find out.
            # A job with boxes is audited box-by-box; one without is audited
            # item-by-item.
            "pending_audit": (
                row.unaudited_boxes > 0 if row.total_boxes else row.unaudited_items > 0
            ),
        }
        for row in result.all()
    ]


@router.get("/my", response_model=List[PicklistOut])
async def my_picklists(
    db: AsyncSession = Depends(get_db),
    current_picker: PickerUser = Depends(get_current_picker),
):
    """
    Picker-facing: full assigned pick lists for the logged-in picker.

    Kept for clients that still want the whole payload. The mobile jobs screen
    uses /picklists/my/summary instead, which is far cheaper.
    """
    result = await db.execute(
        select(Picklist)
        .options(*_PICKLIST_LOAD_OPTIONS)
        .join(PicklistAssignment, PicklistAssignment.picklist_id == Picklist.id)
        .filter(
            PicklistAssignment.picker_id == current_picker.id,
            Picklist.status.in_(ACTIVE_PICK_STATUSES),
        )
        .order_by(desc(Picklist.created_at))
    )
    return result.scalars().unique().all()


@router.get("/my/stats")
async def my_picklist_stats(
    db: AsyncSession = Depends(get_db),
    current_picker: PickerUser = Depends(get_current_picker),
):
    """
    Returns picking statistics for the logged-in picker.

    Aggregated in the database. This used to pull every picklist the picker had
    ever completed — with all their items — into memory and sum them in Python,
    so the picker's home screen got measurably slower with every job they did.
    """
    finished_statuses = ["waiting_verification", "verified", "completed", "dispatched"]
    day_start = datetime.combine(
        datetime.now(timezone.utc).date(), datetime.min.time(), tzinfo=timezone.utc
    )

    picked_qty = case((PicklistItem.is_picked.is_(True), PicklistItem.picked_quantity), else_=0)

    result = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(picked_qty), 0).label("lifetime_items"),
            sqlfunc.coalesce(
                sqlfunc.sum(case((Picklist.created_at >= day_start, picked_qty), else_=0)), 0
            ).label("today_items"),
            sqlfunc.count(sqlfunc.distinct(Picklist.id)).label("orders"),
        )
        .select_from(Picklist)
        .join(PicklistAssignment, PicklistAssignment.picklist_id == Picklist.id)
        .outerjoin(PicklistItem, PicklistItem.picklist_id == Picklist.id)
        .filter(
            PicklistAssignment.picker_id == current_picker.id,
            Picklist.status.in_(finished_statuses),
        )
    )
    row = result.one()
    lifetime_items = row.lifetime_items or 0
    today_items = row.today_items or 0
    orders_picked = row.orders or 0

    return {
        "today_items_picked": int(today_items),
        "lifetime_items_picked": int(lifetime_items),
        "lifetime_orders_picked": orders_picked,
    }


@router.get("/{picklist_id}", response_model=PicklistOut)
async def get_picklist(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Picklist).options(*_PICKLIST_LOAD_OPTIONS).filter(Picklist.id == picklist_id)
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
    """Build a picklist from a previously uploaded and parsed sales order PDF."""
    result = await db.execute(select(SalesOrder).filter(SalesOrder.id == order_id))
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    data = order.extracted_data or {}
    lines = [
        {
            "barcode": item.get("barcode") or "N/A",
            "quantity": item.get("quantity", 1),
            "unit": item.get("uom", DEFAULT_UNIT),
        }
        for item in data.get("items", [])
    ]
    if not lines:
        raise HTTPException(
            status_code=400,
            detail={"message": "Order contains no items to pick.", "errors": []},
        )

    customer_id = await resolve_customer_id(db, None, data.get("customer_name"))

    db_picklist = Picklist(
        order_number=data.get("order_number", f"ORD-{order_id}"),
        customer_id=customer_id,
        sales_order_id=order.id,
        status="draft",
    )
    await flush_with_prefixed_id(db, db_picklist, "picklist_number", PREFIX_PICKLIST)

    items = await _validate_and_build(db, db_picklist.id, lines)
    db.add_all(items)

    order.status = "picklist_generated"
    await db.commit()
    await db.refresh(db_picklist)

    return {
        "message": "Pick list generated",
        "picklist_id": db_picklist.id,
        "picklist_number": db_picklist.picklist_number,
        "order_number": db_picklist.order_number,
        "matched_count": len(items),
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
    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    picklist = result.scalars().first()
    if not picklist:
        raise HTTPException(status_code=404, detail="Pick list not found")

    picker_res = await db.execute(
        select(PickerUser).filter(PickerUser.id == picker_id, PickerUser.is_active.is_(True))
    )
    picker = picker_res.scalars().first()
    if not picker:
        raise HTTPException(status_code=404, detail="Picker not found or inactive")
    if not picker.is_available:
        raise HTTPException(status_code=400, detail="Picker is not available")

    db.add(PicklistAssignment(picklist_id=picklist_id, picker_id=picker_id))
    picklist.status = "assigned"
    picker.is_available = False

    _notify_assignment(picker, picklist, None, background_tasks)
    await db.commit()

    await broadcast_event(
        "PICKLIST_ASSIGNED",
        picklist_id=picklist.id,
        picker_id=picker.id,
        order_number=picklist.order_number,
        message=f"New picklist assigned: {picklist.order_number}",
    )
    return {"message": "Pick list assigned", "picklist_id": picklist_id}


@router.post("/{picklist_id}/auto-assign")
async def auto_assign_existing(
    picklist_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    picklist_res = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    db_picklist = picklist_res.scalars().first()
    if not db_picklist:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if db_picklist.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft pick lists can be assigned")

    picker = await _pick_least_loaded_picker(db)

    db_picklist.picker_job_number = await _next_job_number(db, picker.id)
    db_picklist.status = "assigned"
    db.add(PicklistAssignment(picklist_id=db_picklist.id, picker_id=picker.id))
    picker.is_available = False

    job_label = f"P-{str(db_picklist.picker_job_number).zfill(3)}"
    _notify_assignment(picker, db_picklist, job_label, background_tasks)

    await db.commit()

    await broadcast_event(
        "PICKLIST_ASSIGNED",
        picklist_id=db_picklist.id,
        picker_id=picker.id,
        order_number=db_picklist.order_number,
        message=f"New picklist assigned: {db_picklist.order_number}",
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
    """Create a picklist from extracted items and assign it straight to a picker."""
    picker_res = await db.execute(
        select(PickerUser).filter(PickerUser.id == picker_id, PickerUser.is_active.is_(True))
    )
    picker = picker_res.scalars().first()
    if not picker:
        raise HTTPException(status_code=404, detail="Selected picker staff not found or inactive")

    customer_id = await resolve_customer_id(db, payload.customer_id, payload.customer_name)
    next_job_number = await _next_job_number(db, picker_id)

    db_picklist = Picklist(
        order_number=payload.order_number,
        customer_id=customer_id,
        sales_order_id=None,
        sales_person_id=payload.sales_person_id,
        status="assigned",
        picker_job_number=next_job_number,
        delivery_date=payload.delivery_date,
    )
    await flush_with_prefixed_id(db, db_picklist, "picklist_number", PREFIX_PICKLIST)

    lines = [
        {"barcode": i.barcode or "N/A", "quantity": i.quantity or 1, "unit": i.unit}
        for i in payload.items
    ]
    items = await _validate_and_build(db, db_picklist.id, lines)
    db.add_all(items)

    db.add(PicklistAssignment(picklist_id=db_picklist.id, picker_id=picker_id))
    picker.is_available = False

    job_label = f"P-{str(next_job_number).zfill(3)}"
    _notify_assignment(picker, db_picklist, job_label, background_tasks)

    await db.commit()
    await db.refresh(db_picklist)

    await broadcast_event(
        "PICKLIST_ASSIGNED",
        picklist_id=db_picklist.id,
        picker_id=picker.id,
        order_number=db_picklist.order_number,
        message=f"New picklist assigned: {db_picklist.order_number}",
    )
    return {
        "message": "Pick list generated and assigned to staff directly",
        "picklist_id": db_picklist.id,
        "picklist_number": db_picklist.picklist_number,
        "job_label": job_label,
    }


@router.post("/direct-assign-auto")
async def direct_assign_auto(
    payload: DirectAssignRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Create a picklist and auto-assign it to the least-loaded available picker."""
    customer_id = await resolve_customer_id(db, payload.customer_id, payload.customer_name)

    picker = None
    next_job_number = None
    if payload.auto_assign:
        picker = await _pick_least_loaded_picker(db)
        next_job_number = await _next_job_number(db, picker.id)

    db_picklist = Picklist(
        order_number=payload.order_number,
        customer_id=customer_id,
        sales_order_id=None,
        sales_person_id=payload.sales_person_id,
        status="assigned" if payload.auto_assign else "draft",
        picker_job_number=next_job_number,
        delivery_date=payload.delivery_date,
    )
    await flush_with_prefixed_id(db, db_picklist, "picklist_number", PREFIX_PICKLIST)

    lines = [
        {"barcode": i.barcode or "N/A", "quantity": i.quantity or 1, "unit": i.unit}
        for i in payload.items
    ]
    items = await _validate_and_build(db, db_picklist.id, lines)
    db.add_all(items)

    if not payload.auto_assign:
        await db.commit()
        await db.refresh(db_picklist)
        return {
            "message": "Pick list created as draft",
            "picklist_id": db_picklist.id,
            "picklist_number": db_picklist.picklist_number,
            "job_label": db_picklist.picklist_number,
        }

    assert picker is not None  # auto_assign is True here
    db.add(PicklistAssignment(picklist_id=db_picklist.id, picker_id=picker.id))
    picker.is_available = False

    job_label = f"P-{str(next_job_number).zfill(3)}"
    _notify_assignment(picker, db_picklist, job_label, background_tasks)

    await db.commit()
    await db.refresh(db_picklist)

    await broadcast_event(
        "PICKLIST_ASSIGNED",
        picklist_id=db_picklist.id,
        picker_id=picker.id,
        order_number=db_picklist.order_number,
        message=f"New picklist assigned: {db_picklist.order_number}",
    )
    return {
        "message": "Auto-assigned to picker successfully",
        "picklist_id": db_picklist.id,
        "picklist_number": db_picklist.picklist_number,
        "job_label": job_label,
        "picker_name": picker.full_name,
    }


@router.patch("/{picklist_id}/start")
async def start_picklist(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_picker: PickerUser = Depends(get_current_picker),
):
    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    if pl.status != "assigned":
        raise HTTPException(
            status_code=400, detail=f"Cannot start picklist with status {pl.status}"
        )

    # Block if an older job of this picker is still unfinished — pickers work
    # their queue in order so the floor stays predictable.
    older_query = await db.execute(
        select(Picklist)
        .join(PicklistAssignment, PicklistAssignment.picklist_id == Picklist.id)
        .options(selectinload(Picklist.boxes), selectinload(Picklist.items))
        .filter(
            PicklistAssignment.picker_id == current_picker.id,
            Picklist.status.in_(ACTIVE_PICK_STATUSES),
            Picklist.id < picklist_id,
        )
        .order_by(Picklist.id.asc())
    )

    for older_job in older_query.scalars().unique().all():
        if older_job.status in ("assigned", "picking"):
            raise HTTPException(
                status_code=400,
                detail=f"Please complete your previous picking job ({older_job.order_number}) first.",
            )
        if older_job.status == "waiting_verification":
            if older_job.boxes:
                is_fully_audited = all(b.is_audited for b in older_job.boxes)
            else:
                is_fully_audited = all(i.is_audited for i in older_job.items)
            if not is_fully_audited:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Please wait for WM to scan boxes for previous job "
                        f"({older_job.order_number}) first."
                    ),
                )

    active_query = await db.execute(
        select(Picklist.id)
        .join(PicklistAssignment, PicklistAssignment.picklist_id == Picklist.id)
        .filter(
            PicklistAssignment.picker_id == current_picker.id,
            Picklist.status == "picking",
        )
    )
    if active_query.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="You already have a picking job in progress. Please complete it first.",
        )

    pl.status = "picking"
    await db.commit()

    await broadcast_event(
        "PICKLIST_STARTED",
        picklist_id=pl.id,
        order_number=pl.order_number,
        status=pl.status,
    )

    return {"status": pl.status}


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
        select(PicklistItem).filter(
            PicklistItem.id == item_id,
            PicklistItem.picklist_id == picklist_id,
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

    pl_result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = pl_result.scalars().first()
    if pl and pl.status == "assigned":
        pl.status = "picking"

    await db.commit()

    await broadcast_progress(picklist_id)

    return {"is_picked": item.is_picked, "item_id": item_id}


@router.patch("/{picklist_id}/items/{item_id}/audit")
async def audit_item(
    picklist_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(
        select(PicklistItem).filter(
            PicklistItem.id == item_id,
            PicklistItem.picklist_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_audited = not item.is_audited
    await db.commit()

    await broadcast_progress(picklist_id)

    return {"is_audited": item.is_audited, "item_id": item_id}


@router.post("/{picklist_id}/boxes/{box_id}/verify")
async def verify_box(
    picklist_id: int,
    box_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PicklistBox)
        .options(selectinload(PicklistBox.box_items).joinedload(PicklistBoxItem.item))
        .filter(PicklistBox.id == box_id, PicklistBox.picklist_id == picklist_id)
    )
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    box.is_audited = True
    for bi in box.box_items:
        if bi.item:
            bi.item.is_audited = True

    await db.commit()

    await broadcast_progress(picklist_id)

    return {"message": "Box verified successfully"}


@router.post("/{picklist_id}/items/{item_id}/verify")
async def verify_item(
    picklist_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PicklistItem).filter(
            PicklistItem.id == item_id, PicklistItem.picklist_id == picklist_id
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_audited = True
    await db.commit()

    await broadcast_progress(picklist_id)

    return {"message": "Item verified successfully"}


@router.post("/{picklist_id}/complete-picking")
async def complete_picking(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from backend.services.picklist_service import verify_picklist_service

    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    if pl.active_box_carton_id is not None or pl.active_box_contents:
        raise HTTPException(
            status_code=400,
            detail="Cannot complete job: you have an active box that must be sealed first.",
        )

    items_res = await db.execute(
        select(PicklistItem).filter(PicklistItem.picklist_id == picklist_id)
    )
    items = items_res.scalars().all()

    # Auto-mark any remaining items as picked (handles sync glitches gracefully)
    now = datetime.now(timezone.utc)
    has_loose_items = False
    for item in items:
        if not item.is_full_carton:
            has_loose_items = True
        if not item.is_picked:
            item.is_picked = True
            item.picked_at = now

    if not has_loose_items:
        # No loose items to weigh, so there is nothing for the audit station to
        # do — go straight to verified.
        await db.commit()
        await verify_picklist_service(picklist_id, db)
        result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
        pl = result.scalars().first()
    else:
        pl.status = "waiting_verification"
        assignment_res = await db.execute(
            select(PicklistAssignment).filter(PicklistAssignment.picklist_id == picklist_id)
        )
        assignment = assignment_res.scalars().first()
        if assignment:
            assignment.completed_at = now
        await db.commit()

    from backend.ws_manager import manager

    await manager.broadcast(
        {
            "event": "READY_FOR_AUDIT",
            "picklist_id": pl.id,
            "order_number": pl.order_number,
            "message": f"Order {pl.order_number} is ready for Audit & Verify",
        }
    )

    return {"message": "Picking complete. Awaiting verification."}


# ---------- Boxing & Missing Items ----------

class PreviewWeightRequest(BaseModel):
    item_ids: List[int]
    carton_type_id: int


async def _load_carton(db: AsyncSession, carton_type_id: int) -> CartonType:
    result = await db.execute(select(CartonType).filter(CartonType.id == carton_type_id))
    carton = result.scalars().first()
    if not carton:
        raise HTTPException(status_code=400, detail="Carton type not found")
    return carton


@router.post("/{picklist_id}/boxes/preview-weight")
async def preview_box_weight(
    picklist_id: int,
    payload: PreviewWeightRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns the expected weight for the selected items + carton type before the picker commits."""
    carton = await _load_carton(db, payload.carton_type_id)

    items_res = await db.execute(
        select(PicklistItem)
        .options(selectinload(PicklistItem.product))
        .filter(
            PicklistItem.id.in_(payload.item_ids),
            PicklistItem.picklist_id == picklist_id,
        )
    )
    items = items_res.scalars().unique().all()

    # Packaging weight now comes off the related product rather than a second
    # lookup keyed on a barcode column the catalogue never had.
    expected_weight = carton.tare_weight
    for item in items:
        if item.product:
            expected_weight += (item.product.packaging_weight or 0.0) * item.quantity

    return {
        "expected_weight": round(expected_weight, 3),
        "tare_weight": carton.tare_weight,
        "items_net_weight": round(expected_weight - carton.tare_weight, 3),
    }


@router.post("/{picklist_id}/boxes", response_model=PicklistBoxOut)
async def create_box(
    picklist_id: int,
    payload: PicklistBoxCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Legacy full-carton boxing. Superseded by /boxes/seal for loose items."""
    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Pick list not found")

    carton = await _load_carton(db, payload.carton_type_id)

    items_res = await db.execute(
        select(PicklistItem)
        .options(selectinload(PicklistItem.product))
        .filter(
            PicklistItem.id.in_(payload.item_ids),
            PicklistItem.picklist_id == picklist_id,
        )
    )
    items = items_res.scalars().unique().all()
    if not items:
        raise HTTPException(status_code=400, detail="No valid items to box")

    expected_weight = carton.tare_weight
    for item in items:
        if item.product:
            expected_weight += (item.product.packaging_weight or 0.0) * item.quantity

    lower_bound = expected_weight * (1 - WEIGHT_TOLERANCE_FRACTION)
    upper_bound = expected_weight * (1 + WEIGHT_TOLERANCE_FRACTION)
    if not lower_bound <= payload.entered_weight <= upper_bound:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Weight validation failed. Expected ~{expected_weight:.2f}kg, "
                f"but got {payload.entered_weight:.2f}kg. Please reweigh and check missing items."
            ),
        )

    box = PicklistBox(
        picklist_id=picklist_id,
        carton_type_id=payload.carton_type_id,
        entered_weight=payload.entered_weight,
    )
    db.add(box)
    await db.flush()

    for item in items:
        item.box_id = box.id
        item.is_full_carton = False  # boxed items are loose items

    await db.commit()
    await db.refresh(box)

    await broadcast_progress(picklist_id)

    return box


@router.post("/{picklist_id}/boxes/estimate-weight")
async def estimate_box_weight(
    picklist_id: int,
    payload: SealBoxCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    carton = await _load_carton(db, payload.carton_type_id)

    item_ids = [c.item_id for c in payload.contents]
    items_res = await db.execute(
        select(PicklistItem)
        .options(selectinload(PicklistItem.product))
        .filter(
            PicklistItem.id.in_(item_ids),
            PicklistItem.picklist_id == picklist_id,
        )
    )
    db_items = {item.id: item for item in items_res.scalars().unique().all()}

    breakdown = []
    total_items_weight = 0.0
    for content in payload.contents:
        item = db_items.get(content.item_id)
        if item is None:
            continue
        unit_weight = (item.product.packaging_weight or 0.0) if item.product else 0.0
        line_weight = unit_weight * content.quantity
        total_items_weight += line_weight
        breakdown.append(
            {
                "product_name": item.product_name,
                "quantity": content.quantity,
                "unit_weight": unit_weight,
                "line_weight": line_weight,
            }
        )

    return {
        "tare_weight": carton.tare_weight,
        "total_items_weight": total_items_weight,
        "expected_weight": carton.tare_weight + total_items_weight,
        "breakdown": breakdown,
    }


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
    pl_res = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = pl_res.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    if not pl.active_box_carton_id or not pl.active_box_contents:
        return None

    carton_res = await db.execute(
        select(CartonType).filter(CartonType.id == pl.active_box_carton_id)
    )
    carton = carton_res.scalars().first()
    if not carton:
        return None

    return {
        "carton_type_id": carton.id,
        "carton_name": carton.name,
        "contents": pl.active_box_contents,
    }


@router.put("/{picklist_id}/active-box")
async def set_active_box(
    picklist_id: int,
    payload: Optional[ActiveBoxData] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pl_res = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
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
    pl_res = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = pl_res.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    pl.active_box_carton_id = None
    pl.active_box_contents = None
    await db.commit()
    return {"status": "ok"}


# ---------- Seal Loose Item Box ----------

@router.post("/{picklist_id}/boxes/seal", response_model=PicklistBoxOut)
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
    pl_res = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    if not pl_res.scalars().first():
        raise HTTPException(status_code=404, detail="Pick list not found")

    carton = await _load_carton(db, payload.carton_type_id)

    if not payload.contents:
        raise HTTPException(status_code=400, detail="Box contents cannot be empty")

    item_ids = [c.item_id for c in payload.contents]
    items_res = await db.execute(
        select(PicklistItem)
        .options(selectinload(PicklistItem.product))
        .filter(
            PicklistItem.id.in_(item_ids),
            PicklistItem.picklist_id == picklist_id,
            PicklistItem.is_full_carton.is_(False),  # only loose items
        )
    )
    db_items = {item.id: item for item in items_res.scalars().unique().all()}

    missing_ids = [c.item_id for c in payload.contents if c.item_id not in db_items]
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Item IDs not found or are not loose items: {missing_ids}",
        )

    # Validate box quantities don't exceed what was actually picked. One query
    # for every item at once rather than one per line.
    boxed_res = await db.execute(
        select(PicklistBoxItem.item_id, sqlfunc.sum(PicklistBoxItem.quantity))
        .filter(PicklistBoxItem.item_id.in_(item_ids))
        .group_by(PicklistBoxItem.item_id)
    )
    already_boxed = {item_id: total or 0.0 for item_id, total in boxed_res.all()}

    for content in payload.contents:
        item = db_items[content.item_id]
        boxed = already_boxed.get(content.item_id, 0.0)
        available_to_box = (item.picked_quantity or 0.0) - boxed
        if content.quantity > available_to_box + 0.001:  # small float tolerance
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot box {content.quantity} of item '{item.product_name}'. "
                    f"Only {available_to_box:.2f} units remain unboxed "
                    f"(picked: {item.picked_quantity}, already boxed: {boxed})."
                ),
            )

    # Calculate expected weight from actual box contents (not full item qty)
    expected_weight = carton.tare_weight
    for content in payload.contents:
        item = db_items[content.item_id]
        if item.product and item.product.packaging_weight:
            expected_weight += item.product.packaging_weight * content.quantity

    lower_bound = expected_weight * (1 - WEIGHT_TOLERANCE_FRACTION)
    upper_bound = expected_weight * (1 + WEIGHT_TOLERANCE_FRACTION)
    if not lower_bound <= payload.entered_weight <= upper_bound:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Weight validation failed. Expected ~{expected_weight:.2f} kg "
                f"(±{WEIGHT_TOLERANCE_FRACTION * 100:.1f}%), got {payload.entered_weight:.2f} kg. "
                "Please reweigh or check for missing items."
            ),
        )

    box = PicklistBox(
        picklist_id=picklist_id,
        carton_type_id=payload.carton_type_id,
        entered_weight=payload.entered_weight,
    )
    db.add(box)
    await db.flush()  # get box.id

    for content in payload.contents:
        db.add(
            PicklistBoxItem(
                box_id=box.id,
                item_id=content.item_id,
                quantity=content.quantity,
            )
        )

    await db.commit()
    await db.refresh(box)

    await broadcast_progress(picklist_id)

    return box


@router.patch("/{picklist_id}/items/{item_id}/report-missing")
async def report_missing_item(
    picklist_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(PicklistItem).filter(
            PicklistItem.id == item_id,
            PicklistItem.picklist_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.missing_reported = True
    await db.commit()

    await broadcast_progress(picklist_id)

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
        select(PicklistItem).filter(
            PicklistItem.id == item_id,
            PicklistItem.picklist_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if approved:
        item.missing_approved = True
        item.is_picked = False  # missing item is not picked
    else:
        item.missing_approved = False
        item.missing_reported = False  # rejected, need to find it

    await db.commit()

    await broadcast_progress(picklist_id)

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
    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    pl.status = "picking"

    # Mark incomplete items as un-picked so the picker knows what to pick
    items_res = await db.execute(
        select(PicklistItem).filter(PicklistItem.picklist_id == picklist_id)
    )
    for item in items_res.scalars().all():
        if (item.picked_quantity or 0) < item.quantity:
            item.is_picked = False

    assignment_res = await db.execute(
        select(PicklistAssignment)
        .options(selectinload(PicklistAssignment.picker))
        .filter(PicklistAssignment.picklist_id == picklist_id)
    )
    assignment = assignment_res.scalars().first()

    picker_id = None
    if assignment and assignment.picker:
        picker = assignment.picker
        picker_id = picker.id
        trigger_push(
            picker.push_token,
            "Pick List Returned for Correction",
            f"Order #{pl.order_number}: {reason}",
            background_tasks=background_tasks,
        )

    await db.commit()

    await broadcast_event(
        "PICKLIST_RETURNED",
        picklist_id=pl.id,
        picker_id=picker_id,
        order_number=pl.order_number,
        message=f"Order #{pl.order_number} returned: {reason}",
    )
    return {"message": "Returned to picker"}


@router.patch("/{picklist_id}/verify")
async def verify_picklist(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Verifies a picklist, deducting inventory automatically."""
    from backend.services.picklist_service import verify_picklist_service

    result = await verify_picklist_service(picklist_id, db)

    await broadcast_event("PICKLIST_VERIFIED", picklist_id=picklist_id)

    return result


# ---------- Export ----------

@router.get("/{picklist_id}/download/pdf")
async def download_pdf(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(
        select(Picklist)
        .options(
            selectinload(Picklist.items).joinedload(PicklistItem.product),
            selectinload(Picklist.customer),
        )
        .filter(Picklist.id == picklist_id)
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
        select(Picklist)
        .options(
            selectinload(Picklist.items).joinedload(PicklistItem.product),
            selectinload(Picklist.customer),
        )
        .filter(Picklist.id == picklist_id)
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
    excel_bytes = generate_branded_picklist_excel([item.model_dump() for item in items])
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=picklist_{timestamp}.xlsx"},
    )


# ---------- Complete & Purge / Cancel ----------

async def _release_pickers_and_purge(
    db: AsyncSession,
    pl: Picklist,
    background_tasks: Optional[BackgroundTasks],
    notify_cancellation: bool,
) -> List[int]:
    """
    Free every picker assigned to ``pl`` and delete the job together with the
    sales order it came from.

    Shared by the cancel and the purge-on-complete endpoints, which differ only
    in whether the picker is told the job was cancelled.

    Returns the ids of the released pickers so the caller can name them in the
    WebSocket event it broadcasts after committing.
    """
    assignment_res = await db.execute(
        select(PicklistAssignment)
        .options(selectinload(PicklistAssignment.picker))
        .filter(PicklistAssignment.picklist_id == pl.id)
    )

    released: List[int] = []
    for assign in assignment_res.scalars().unique().all():
        picker = assign.picker
        if picker:
            picker.is_available = True
            released.append(picker.id)
            if notify_cancellation:
                trigger_push(
                    picker.push_token,
                    "Assigned Job Cancelled",
                    f"Order #{pl.order_number} has been cancelled by admin and removed from your tasks.",
                    background_tasks=background_tasks,
                )
        await db.delete(assign)

    order_id = pl.sales_order_id
    if order_id:
        order_res = await db.execute(select(SalesOrder).filter(SalesOrder.id == order_id))
        order = order_res.scalars().first()
        if order:
            await db.delete(order)

    # Items, boxes and box-items go with the parent via ON DELETE CASCADE.
    await db.delete(pl)
    await db.commit()
    return released


@router.delete("/{picklist_id}")
@router.delete("/{picklist_id}/cancel")
async def cancel_and_purge_picklist(
    picklist_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Cancels an ongoing or draft job, frees the picker, and removes all its data."""
    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list job not found")

    order_number = pl.order_number
    released = await _release_pickers_and_purge(
        db, pl, background_tasks, notify_cancellation=True
    )

    await broadcast_event(
        "PICKLIST_CANCELLED",
        picklist_id=picklist_id,
        picker_ids=released,
        order_number=order_number,
        message=f"Order #{order_number} has been cancelled and removed from the queue.",
    )
    return {"message": "Ongoing job cancelled and removed from database successfully."}


@router.delete("/{picklist_id}/complete")
async def purge_completed_picklist(
    picklist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    order_number = pl.order_number
    released = await _release_pickers_and_purge(db, pl, None, notify_cancellation=False)

    await broadcast_event(
        "PICKLIST_PURGED",
        picklist_id=picklist_id,
        picker_ids=released,
        order_number=order_number,
    )
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
    result = await db.execute(select(Picklist).filter(Picklist.id == picklist_id))
    picklist = result.scalars().first()
    if not picklist:
        raise HTTPException(status_code=404, detail="Pick list not found")

    new_picker_res = await db.execute(
        select(PickerUser).filter(
            PickerUser.id == payload.new_picker_id, PickerUser.is_active.is_(True)
        )
    )
    new_picker = new_picker_res.scalars().first()
    if not new_picker:
        raise HTTPException(status_code=404, detail="New picker not found or inactive")
    if not new_picker.is_available:
        raise HTTPException(status_code=400, detail="New picker is not available")

    assignment_res = await db.execute(
        select(PicklistAssignment)
        .options(selectinload(PicklistAssignment.picker))
        .filter(PicklistAssignment.picklist_id == picklist_id)
    )
    old_assignments = assignment_res.scalars().unique().all()

    old_picker_id = None
    if old_assignments:
        old_assignment = old_assignments[-1]
        if old_assignment.picker_id == payload.new_picker_id:
            raise HTTPException(
                status_code=400, detail="Pick list is already assigned to this picker"
            )

        old_picker = old_assignment.picker
        if old_picker:
            old_picker.is_available = True
            old_picker_id = old_picker.id
            trigger_push(
                old_picker.push_token,
                "Job Reassigned",
                f"Order #{picklist.order_number} has been reassigned to another picker.",
                background_tasks=background_tasks,
            )

    db.add(PicklistAssignment(picklist_id=picklist_id, picker_id=new_picker.id))
    new_picker.is_available = False

    trigger_push(
        new_picker.push_token,
        "New Job Assigned",
        f"Order #{picklist.order_number} has been reassigned to you.",
        background_tasks=background_tasks,
    )

    await db.commit()

    await broadcast_event(
        "PICKLIST_REASSIGNED",
        picklist_id=picklist_id,
        picker_id=new_picker.id,
        previous_picker_id=old_picker_id,
        order_number=picklist.order_number,
        message=f"Order #{picklist.order_number} has been reassigned.",
    )
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
        select(PicklistItem)
        .options(selectinload(PicklistItem.product))
        .filter(
            PicklistItem.id == item_id,
            PicklistItem.picklist_id == picklist_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_full_carton = payload.is_full_carton
    # The barcode a picker scans depends on which kind of line this is, so it
    # has to follow the toggle.
    if item.product:
        item.barcode = (
            item.product.primary_barcode
            if payload.is_full_carton
            else (item.product.secondary_barcode or item.product.primary_barcode)
        )

    await db.commit()

    await broadcast_progress(picklist_id)

    return {"is_full_carton": item.is_full_carton}
