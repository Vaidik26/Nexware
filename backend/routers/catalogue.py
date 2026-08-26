"""
Product catalogue router.

The route prefix stays ``/catalogue`` — the rename in this refactor was of the
table and model (``sales_items``/``SalesItem`` → ``products``/``Product``), not
of the public API surface.
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.database import get_db
from backend.dependencies import get_current_admin
from backend.models.picklist import PicklistItem
from backend.models.products import CartonType, Product
from backend.schemas.products import (
    CartonTypeCreate,
    CartonTypeOut,
    ProductCreate,
    ProductOut,
)
from backend.services.excel_service import parse_catalogue_excel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


# --- CartonType Endpoints ---
# Declared before /{product_id} so the literal path wins the match.

@router.get("/cartons", response_model=List[CartonTypeOut])
async def get_cartons(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CartonType))
    return result.scalars().all()


@router.post("/cartons", response_model=CartonTypeOut)
async def create_carton(
    item: CartonTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    existing = await db.execute(select(CartonType).filter(CartonType.name == item.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Carton Type with this name already exists")
    db_item = CartonType(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item


@router.delete("/cartons/{carton_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_carton(
    carton_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(CartonType).filter(CartonType.id == carton_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Carton Type not found")
    await db.delete(item)
    await db.commit()


# --- Product Endpoints ---

@router.get("", response_model=List[ProductOut])
@router.get("/", response_model=List[ProductOut])
async def get_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).order_by(Product.id))
    return result.scalars().all()


@router.post("", response_model=ProductOut)
@router.post("/", response_model=ProductOut)
async def create_product(
    item: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    existing = await db.execute(
        select(Product).filter(
            (Product.product_code == item.product_code)
            | (Product.primary_barcode == item.primary_barcode)
            | (Product.secondary_barcode == item.primary_barcode)
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Product code or barcode already exists")

    db_item = Product(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item


@router.post("/import")
async def import_catalogue(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    content = await file.read()
    items = parse_catalogue_excel(content)

    created_count = 0
    for item_data in items:
        # The importer still speaks the spreadsheet's column names; translate to
        # the model's field names here rather than teaching the parser the schema.
        if "item_number" in item_data:
            item_data["product_code"] = item_data.pop("item_number")
        if "item_name" in item_data:
            item_data["name"] = item_data.pop("item_name")
        if "barcode" in item_data:
            item_data["primary_barcode"] = item_data.pop("barcode")

        existing = await db.execute(
            select(Product).filter(
                (Product.product_code == item_data.get("product_code"))
                | (Product.primary_barcode == item_data.get("primary_barcode"))
            )
        )
        if not existing.scalars().first():
            db.add(Product(**item_data))
            created_count += 1

    await db.commit()
    return {"message": f"Successfully imported {created_count} items"}


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    item: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(Product).filter(Product.id == product_id))
    db_item = result.scalars().first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Product not found")

    duplicate = await db.execute(
        select(Product).filter(
            (Product.id != product_id)
            & (
                (Product.product_code == item.product_code)
                | (Product.primary_barcode == item.primary_barcode)
            )
        )
    )
    if duplicate.scalars().first():
        raise HTTPException(
            status_code=400, detail="Product code or barcode already exists on another SKU"
        )

    for field, value in item.model_dump().items():
        setattr(db_item, field, value)

    # Real-time reflection: picklist lines hold the barcode the picker must scan,
    # so a barcode change has to reach jobs already on the floor. The product's
    # name and other master data are read through the relationship and need no
    # propagation. Lines are matched by product_id, not by the old barcode.
    linked_records = await db.execute(
        select(PicklistItem).filter(PicklistItem.product_id == product_id)
    )
    for rec in linked_records.scalars().all():
        rec.barcode = (
            item.primary_barcode
            if rec.is_full_carton
            else (item.secondary_barcode or item.primary_barcode)
        )
        if not rec.is_full_carton:
            rec.unit = item.unit

    await db.commit()
    await db.refresh(db_item)
    return db_item


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(Product).filter(Product.id == product_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")

    # Safeguard: the FK would refuse the delete anyway; this turns that into a
    # readable 400 instead of a 500 from the database.
    linked_records = await db.execute(
        select(PicklistItem.id).filter(PicklistItem.product_id == product_id)
    )
    if linked_records.scalars().first():
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot delete product: this SKU is referenced in active or archived "
                "warehouse picklist records. Remove or complete associated records first."
            ),
        )

    await db.delete(item)
    await db.commit()
