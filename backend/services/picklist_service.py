import logging
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import HTTPException
from sqlalchemy import delete, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.models.catalogue import SalesItem
from backend.models.order import SalesOrder
from backend.models.picklist import PickList, PickAssignment
from backend.models.user import User, Notification

logger = logging.getLogger(__name__)

async def verify_picklist_service(picklist_id: int, db: AsyncSession) -> Dict[str, Any]:
    """
    Business logic to verify a picklist.
    Handles atomic inventory deduction and assignment cleanup.
    """
    # 1. Fetch the picklist and items with FOR UPDATE to prevent concurrent verification
    result = await db.execute(
        select(PickList)
        .options(selectinload(PickList.items))
        .filter(PickList.id == picklist_id)
        .with_for_update()
    )
    pl = result.scalars().first()
    
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status not in ("waiting_verification", "picking", "assigned"):
        raise HTTPException(status_code=400, detail="Pick list is not in an active operational state")
        
    unresolved_missing = [item for item in pl.items if item.missing_reported and item.missing_approved is None]
    if unresolved_missing:
        raise HTTPException(status_code=400, detail="Please approve or reject all missing items before verifying this order.")

    # 2. Mark as verified
    pl.status = "verified"

    # 3. Cleanup assignments and notifications
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

    # 4. Atomic inventory deduction
    # We collect all items to be deducted, and then do a bulk atomic update, or multiple atomic updates.
    for item in pl.items:
        if item.is_picked and not item.missing_approved:
            # Atomic update to avoid Read-Modify-Write race condition
            await db.execute(
                update(SalesItem)
                .where(SalesItem.barcode == item.barcode)
                .values(available_quantity=func.greatest(0, SalesItem.available_quantity - item.quantity))
            )
            logger.info("Atomically deducted %s units from SalesItem %s", item.quantity, item.barcode)

    # 5. Update parent sales order
    if pl.sales_order_id:
        order_res = await db.execute(select(SalesOrder).filter(SalesOrder.id == pl.sales_order_id))
        order = order_res.scalars().first()
        if order:
            order.status = "verified"

    await db.commit()
    logger.info("Successfully verified PickList ID: %s", pl.id)
    
    return {"message": "Order verified successfully", "picklist_id": pl.id}
