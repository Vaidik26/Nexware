"""
Pydantic schemas for the LPO (Local Purchase Order) module.

``customer_name`` and ``product_name`` still appear on the *output* schemas —
they are read through the SQLAlchemy relationships (see the properties on
``Lpo`` and ``LpoItem``) rather than stored, so the API contract clients already
depend on is unchanged while the database keeps only the foreign key.
"""
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class LpoItemIn(BaseModel):
    """One ordered line as submitted by a client."""

    barcode: str
    quantity: float
    unit: str = "PCS"
    # Either resolves to a catalogue product, or is kept as free text when the
    # barcode is not in the catalogue yet.
    product_id: Optional[int] = None
    product_name: Optional[str] = None


class LpoItemOut(BaseModel):
    id: int
    barcode: str
    quantity: float
    unit: str
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class LpoCreate(BaseModel):
    lpo_number: str
    items: List[LpoItemIn]
    # Send customer_id. customer_name is accepted as a fallback and resolved
    # against the customers table; one of the two is required.
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    sales_person_id: Optional[int] = None  # optional — manual/admin orders may not have one
    delivery_date: Optional[datetime] = None
    source: Optional[str] = "upload"       # 'upload' | 'manual' | 'mobile'

    @model_validator(mode="after")
    def _require_a_customer(self):
        if self.customer_id is None and not (self.customer_name or "").strip():
            raise ValueError("Either customer_id or customer_name is required")
        return self


class LpoUpdate(BaseModel):
    items: List[LpoItemIn]
    delivery_date: Optional[datetime] = None


class LpoUpdateStatus(BaseModel):
    status: str


class ApproveRequest(BaseModel):
    assign_mode: str                  # 'auto' | 'manual'
    picker_id: Optional[int] = None   # required when assign_mode == 'manual'


class LpoOut(BaseModel):
    id: int
    lpo_number: str
    internal_ref: str
    customer_id: int
    customer_name: Optional[str] = None
    sales_person_id: Optional[int] = None
    items: List[LpoItemOut] = []
    signed_lpo_url: Optional[str] = None
    status: str
    source: Optional[str] = "upload"
    delivery_date: Optional[datetime] = None
    created_at: Optional[Any] = None
    created_by_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
