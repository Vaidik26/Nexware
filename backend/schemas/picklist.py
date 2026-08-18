from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class PickListItemBase(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str
    is_picked: bool = False
    is_audited: bool = False
    is_full_carton: bool = True
    box_id: Optional[int] = None
    missing_reported: bool = False
    missing_approved: Optional[bool] = None
    bin_location: Optional[str] = None

class PickListItemOut(PickListItemBase):
    id: int
    pick_list_id: int
    picked_quantity: float = 0.0
    picked_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class PickListBase(BaseModel):
    order_number: str
    customer_name: str
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

class PickListBoxItemOut(BaseModel):
    id: int
    item_id: int
    quantity: float
    model_config = ConfigDict(from_attributes=True)

class PickListBoxBase(BaseModel):
    carton_type_id: int
    entered_weight: float

class PickListBoxCreate(PickListBoxBase):
    """Legacy: used by old full-carton boxing. Kept for backward compatibility."""
    item_ids: List[int]

class PickListBoxOut(PickListBoxBase):
    id: int
    pick_list_id: int
    created_at: datetime
    is_audited: bool = False
    box_items: List[PickListBoxItemOut] = []
    model_config = ConfigDict(from_attributes=True)

class PickListOut(PickListBase):
    id: int
    sales_order_id: Optional[int]
    sales_person_id: Optional[int] = None
    picker_job_number: Optional[int] = None
    assigned_picker_id: Optional[int] = None
    assigned_picker_name: Optional[str] = None
    created_at: datetime
    items: List[PickListItemOut] = []
    boxes: List[PickListBoxOut] = []
    model_config = ConfigDict(from_attributes=True)

