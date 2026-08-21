from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any, Dict
from datetime import date, datetime

class RawMaterialBase(BaseModel):
    material_code: str
    material_name: str
    bag_carton_weight: Optional[str] = None
    weight_unit: Optional[str] = "kg"
    category: str = "Uncategorized"
    market_type: str = "BOTH"

class RawMaterialCreate(RawMaterialBase):
    pass

class RawMaterialUpdate(RawMaterialBase):
    pass

class RawMaterialOut(RawMaterialBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class CapturedPriceBase(BaseModel):
    material_id: int
    date: date
    local_price_aed: Optional[float] = None
    local_price_omr: Optional[float] = None
    supplier_dubai: Optional[str] = None
    supplier_oman: Optional[str] = None
    fob_price: Optional[float] = None
    cif_price: Optional[float] = None

class CapturedPriceCreate(CapturedPriceBase):
    pass

class CapturedPriceOut(CapturedPriceBase):
    id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class PriceHistoryReportRequest(BaseModel):
    scope: str
    generated_at: Optional[str] = None
    dates: List[Dict[str, Any]]
