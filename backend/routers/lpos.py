from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from pydantic import BaseModel
from typing import Optional, Any
from backend.database import get_db
from backend.models.lpo import Lpo
from backend.models.user import User
from backend.models.picklist import PickList, PickListItem
from backend.models.catalogue import SalesItem


router = APIRouter(prefix="/lpos", tags=["lpos"])

class LpoItemSchema(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str

class LpoCreate(BaseModel):
    lpo_number: str
    customer_name: str
    items: List[LpoItemSchema]
    sales_person_id: int
    delivery_date: Optional[str] = None

class LpoUpdateStatus(BaseModel):
    status: str

class LpoOut(BaseModel):
    id: int
    lpo_number: str
    customer_name: str
    sales_person_id: int
    items: Any
    signed_lpo_url: Optional[str]
    status: str
    delivery_date: Optional[str] = None
    
    class Config:
        from_attributes = True

@router.get("", response_model=List[LpoOut])
@router.get("/", response_model=List[LpoOut])
async def get_lpos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).order_by(Lpo.created_at.desc()))
    return result.scalars().all()

@router.post("", response_model=LpoOut)
@router.post("/", response_model=LpoOut)
async def create_lpo(lpo: LpoCreate, db: AsyncSession = Depends(get_db)):
    db_lpo = Lpo(
        lpo_number=lpo.lpo_number,
        customer_name=lpo.customer_name,
        sales_person_id=lpo.sales_person_id,
        items=[item.dict() for item in lpo.items],
        delivery_date=lpo.delivery_date
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

@router.delete("/{lpo_id}")
async def delete_lpo(lpo_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lpo).filter(Lpo.id == lpo_id))
    lpo = result.scalar_one_or_none()
    if not lpo:
        raise HTTPException(status_code=404, detail="LPO not found")
    
    await db.delete(lpo)
    await db.commit()
    return {"message": "LPO deleted successfully"}

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
        "items_count": verified_count
    }
