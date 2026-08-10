from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from backend.models.picklist import PickListItem
from backend.database import get_db
from backend.schemas.catalogue import SalesItemCreate, SalesItemOut, CartonTypeCreate, CartonTypeOut
from backend.models.catalogue import SalesItem, CartonType
from backend.dependencies import get_current_admin
from backend.services.excel_service import parse_catalogue_excel

router = APIRouter(prefix="/catalogue", tags=["catalogue"])

@router.get("", response_model=List[SalesItemOut])
@router.get("/", response_model=List[SalesItemOut])
async def get_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesItem))
    return result.scalars().all()

@router.post("", response_model=SalesItemOut)
@router.post("/", response_model=SalesItemOut)
async def create_item(item: SalesItemCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    existing_item = await db.execute(select(SalesItem).filter(
        (SalesItem.item_number == item.item_number) | (SalesItem.barcode == item.barcode)
    ))
    if existing_item.scalars().first():
        raise HTTPException(status_code=400, detail="Item number or barcode already exists")
        
    db_item = SalesItem(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item

@router.post("/import")
async def import_catalogue(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    content = await file.read()
    items = parse_catalogue_excel(content)
    
    created_count = 0
    for item_data in items:
        # Check if exists
        existing = await db.execute(select(SalesItem).filter(
            (SalesItem.item_number == item_data["item_number"]) | 
            (SalesItem.barcode == item_data["barcode"])
        ))
        if not existing.scalars().first():
            db_item = SalesItem(**item_data)
            db.add(db_item)
            created_count += 1
            
    await db.commit()
    return {"message": f"Successfully imported {created_count} items"}

@router.put("/{item_id}", response_model=SalesItemOut)
async def update_item(item_id: int, item: SalesItemCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    result = await db.execute(select(SalesItem).filter(SalesItem.id == item_id))
    db_item = result.scalars().first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Catalogue item not found")
        
    # Check duplicate item_number or barcode from OTHER items
    duplicate = await db.execute(
        select(SalesItem).filter(
            (SalesItem.id != item_id) & 
            ((SalesItem.item_number == item.item_number) | (SalesItem.barcode == item.barcode))
        )
    )
    if duplicate.scalars().first():
        raise HTTPException(status_code=400, detail="Item number or barcode already exists on another SKU")

    old_barcode = db_item.barcode
    
    # Update item master details
    db_item.item_number = item.item_number
    db_item.item_name = item.item_name
    db_item.barcode = item.barcode
    db_item.unit = item.unit
    db_item.bin_location = item.bin_location
    db_item.standard_carton_quantity = item.standard_carton_quantity
    db_item.packaging_weight = item.packaging_weight
    db_item.sku_size_category = item.sku_size_category
    db_item.available_quantity = item.available_quantity
    
    # Real-time reflection: propagate changes to active pick list records on the floor
    linked_records = await db.execute(select(PickListItem).filter(PickListItem.barcode == old_barcode))
    for rec in linked_records.scalars().all():
        rec.barcode = item.barcode
        rec.product_name = item.item_name
        rec.unit = item.unit

    await db.commit()
    await db.refresh(db_item)
    return db_item

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalogue_item(item_id: int, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    result = await db.execute(select(SalesItem).filter(SalesItem.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalogue item not found")
        
    # Safeguard: Prevent deletion if this item's barcode exists in warehouse records (PickListItem)
    linked_records = await db.execute(select(PickListItem).filter(PickListItem.barcode == item.barcode))
    if linked_records.scalars().first():
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete item: This SKU is currently referenced in active or archived warehouse pick list records. Remove or complete associated records first."
        )
        
    await db.delete(item)
    await db.commit()

# --- CartonType Endpoints ---
@router.get("/cartons", response_model=List[CartonTypeOut])
async def get_cartons(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CartonType))
    return result.scalars().all()

@router.post("/cartons", response_model=CartonTypeOut)
async def create_carton(item: CartonTypeCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    existing = await db.execute(select(CartonType).filter(CartonType.name == item.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Carton Type with this name already exists")
    db_item = CartonType(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item

@router.delete("/cartons/{carton_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_carton(carton_id: int, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    result = await db.execute(select(CartonType).filter(CartonType.id == carton_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Carton Type not found")
    await db.delete(item)
    await db.commit()
