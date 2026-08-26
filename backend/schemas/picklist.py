"""
Pydantic schemas for the picking module.

``customer_name`` / ``product_name`` are read through the SQLAlchemy
relationships (properties on ``Picklist`` and ``PicklistItem``) rather than
stored on the row, so the response payload keeps the shape clients already
consume while the database holds only ``customer_id`` / ``product_id``.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class PicklistItemBase(BaseModel):
    product_id: int
    # Which of the product's two barcodes this line must be scanned against —
    # primary for full cartons, secondary for loose pieces.
    barcode: str
    product_name: Optional[str] = None
    quantity: float
    unit: str
    is_picked: bool = False
    is_audited: bool = False
    is_full_carton: bool = True
    box_id: Optional[int] = None
    missing_reported: bool = False
    missing_approved: Optional[bool] = None
    bin_location: Optional[str] = None


class PicklistItemOut(PicklistItemBase):
    id: int
    picklist_id: int
    picked_quantity: float = 0.0
    picked_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class PicklistBase(BaseModel):
    picklist_number: str
    order_number: str
    customer_id: int
    customer_name: Optional[str] = None
    status: str
    delivery_date: Optional[datetime] = None


# ── Boxing schemas ──────────────────────────────────────────────

class BoxContent(BaseModel):
    """One item line going into a box: which item and how many units."""

    item_id: int
    quantity: float


class SealBoxCreate(BaseModel):
    """Payload sent when the picker seals a loose-item box at the weighing station."""

    carton_type_id: int
    entered_weight: float
    contents: List[BoxContent]  # what went into this specific box


class PicklistBoxItemOut(BaseModel):
    id: int
    item_id: int
    quantity: float
    model_config = ConfigDict(from_attributes=True)


class PicklistBoxBase(BaseModel):
    carton_type_id: int
    entered_weight: float


class PicklistBoxCreate(PicklistBoxBase):
    """Legacy: used by old full-carton boxing. Kept for backward compatibility."""

    item_ids: List[int]


class CartonTypeOut(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class PicklistBoxOut(PicklistBoxBase):
    id: int
    picklist_id: int
    created_at: datetime
    is_audited: bool = False
    box_items: List[PicklistBoxItemOut] = []
    carton_type: Optional[CartonTypeOut] = None
    model_config = ConfigDict(from_attributes=True)


class PicklistOut(PicklistBase):
    id: int
    sales_order_id: Optional[int] = None
    sales_person_id: Optional[int] = None
    sales_person_name: Optional[str] = None
    picker_job_number: Optional[int] = None
    assigned_picker_id: Optional[int] = None
    assigned_picker_name: Optional[str] = None
    created_at: datetime
    items: List[PicklistItemOut] = []
    boxes: List[PicklistBoxOut] = []
    model_config = ConfigDict(from_attributes=True)
