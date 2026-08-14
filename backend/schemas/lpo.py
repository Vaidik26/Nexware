"""
Pydantic schemas for the LPO (Local Purchase Order) module.
"""
from pydantic import BaseModel
from typing import Any, List, Optional
from datetime import datetime


class LpoItemSchema(BaseModel):
    barcode: str
    product_name: str
    quantity: float
    unit: str


class LpoCreate(BaseModel):
    lpo_number: str
    customer_name: str
    items: List[LpoItemSchema]
    sales_person_id: Optional[int] = None  # optional — manual/admin orders may not have one
    delivery_date: Optional[datetime] = None
    source: Optional[str] = "upload"       # 'upload' | 'manual' | 'mobile'


class LpoUpdate(BaseModel):
    items: List[LpoItemSchema]
    delivery_date: Optional[datetime] = None

class LpoUpdateStatus(BaseModel):
    status: str


class ApproveRequest(BaseModel):
    assign_mode: str              # 'auto' | 'manual'
    picker_id: Optional[int] = None  # required when assign_mode == 'manual'


class LpoOut(BaseModel):
    id: int
    lpo_number: str
    customer_name: str
    sales_person_id: Optional[int] = None
    items: Any
    signed_lpo_url: Optional[str] = None
    status: str
    source: Optional[str] = "upload"
    delivery_date: Optional[datetime] = None
    created_at: Optional[Any] = None
    created_by_name: Optional[str] = None

    model_config = {"from_attributes": True}
