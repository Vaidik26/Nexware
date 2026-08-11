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
    picked_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class PickListBase(BaseModel):
    order_number: str
    customer_name: str
    status: str
    delivery_date: Optional[datetime] = None

class PickListBoxBase(BaseModel):
    carton_type_id: int
    entered_weight: float

class PickListBoxCreate(PickListBoxBase):
    item_ids: List[int]

class PickListBoxOut(PickListBoxBase):
    id: int
    pick_list_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PickListOut(PickListBase):
    id: int
    sales_order_id: Optional[int]
    picker_job_number: Optional[int] = None
    assigned_picker_id: Optional[int] = None
    assigned_picker_name: Optional[str] = None
    created_at: datetime
    items: List[PickListItemOut] = []
    boxes: List[PickListBoxOut] = []
    model_config = ConfigDict(from_attributes=True)
