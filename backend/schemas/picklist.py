from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class PickListItemBase(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str
    is_picked: bool = False

class PickListItemOut(PickListItemBase):
    id: int
    pick_list_id: int
    picked_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class PickListBase(BaseModel):
    order_number: str
    customer_name: str
    status: str

class PickListOut(PickListBase):
    id: int
    sales_order_id: Optional[int]
    picker_job_number: Optional[int] = None
    assigned_picker_id: Optional[int] = None
    assigned_picker_name: Optional[str] = None
    created_at: datetime
    items: List[PickListItemOut] = []
    model_config = ConfigDict(from_attributes=True)
