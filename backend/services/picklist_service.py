import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import HTTPException
from sqlalchemy import Float, Integer, column, func, update, values
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.models.order import SalesOrder
from backend.models.picklist import Picklist, PicklistAssignment
from backend.models.products import Product

logger = logging.getLogger(__name__)


async def verify_picklist_service(picklist_id: int, db: AsyncSession) -> Dict[str, Any]:
    """
    Business logic to verify a picklist.
    Handles atomic inventory deduction and assignment cleanup.
    """
    # 1. Fetch the picklist and items with FOR UPDATE to prevent concurrent verification
    result = await db.execute(
        select(Picklist)
        .options(selectinload(Picklist.items))
        .filter(Picklist.id == picklist_id)
        .with_for_update(of=Picklist)
    )
    pl = result.scalars().first()

    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")

    # Already verified. The inventory deduction below is not repeatable, so the
    # guard has to stay — but a repeat is overwhelmingly a client that lost the
    # response and tried again, not a genuine error. Report the finished state
    # instead of failing an action that already succeeded.
    if pl.status == "verified":
        logger.info("Picklist %s is already verified; returning the existing state", picklist_id)
        return {
            "message": "Pick list already verified",
            "picklist_id": pl.id,
            "status": pl.status,
            "replayed": True,
        }

    if pl.status not in ("waiting_verification", "picking", "assigned"):
        raise HTTPException(
            status_code=400, detail="Pick list is not in an active operational state"
        )

    unresolved_missing = [
        item for item in pl.items if item.missing_reported and item.missing_approved is None
    ]
    if unresolved_missing:
        raise HTTPException(
            status_code=400,
            detail="Please approve or reject all missing items before verifying this order.",
        )

    # 2. Mark as verified
    pl.status = "verified"

    # 3. Close out assignments and free the pickers
    assignment_res = await db.execute(
        select(PicklistAssignment)
        .options(selectinload(PicklistAssignment.picker))
        .filter(PicklistAssignment.picklist_id == picklist_id)
    )

    for assign in assignment_res.scalars().unique().all():
        assign.completed_at = datetime.now(timezone.utc)
        if assign.picker:
            assign.picker.is_available = True

    # 4. Atomic inventory deduction, keyed on the product FK rather than a
    #    barcode string — a line and its product can no longer drift apart.
    #
    #    Issued as ONE statement for the whole picklist. It used to be an UPDATE
    #    per line, so verifying a 30-line order cost 30 round trips to a remote
    #    database — the single biggest reason submission felt slow. The deduction
    #    is still atomic and still floors at zero; the arithmetic just happens
    #    set-wise via a VALUES join.
    deductions: Dict[int, float] = {}
    for item in pl.items:
        if item.is_picked and not item.missing_approved:
            # A product can appear twice (a full-carton line and a loose line),
            # so quantities are summed before the update rather than overwriting.
            deductions[item.product_id] = deductions.get(item.product_id, 0) + item.quantity

    if deductions:
        wanted = values(
            column("product_id", Integer),
            column("qty", Float),
            name="deductions",
        ).data(list(deductions.items()))

        await db.execute(
            update(Product)
            .where(Product.id == wanted.c.product_id)
            .values(
                available_quantity=func.greatest(
                    0, Product.available_quantity - wanted.c.qty
                )
            )
        )
        logger.info(
            "Deducted stock for %d product(s) on picklist %s in one statement",
            len(deductions),
            picklist_id,
        )

    # 5. Update parent sales order
    if pl.sales_order_id:
        order_res = await db.execute(
            select(SalesOrder).filter(SalesOrder.id == pl.sales_order_id)
        )
        order = order_res.scalars().first()
        if order:
            order.status = "verified"

    await db.commit()
    logger.info("Successfully verified Picklist ID: %s", pl.id)

    return {"message": "Order verified successfully", "picklist_id": pl.id}
