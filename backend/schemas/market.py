from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any, Dict
from datetime import date, datetime

class RawMaterialBase(BaseModel):
    material_code: str
    material_name: str
    bag_carton_weight: float
    weight_unit: Optional[str] = "kg"

class RawMaterialCreate(RawMaterialBase):
    pass

class RawMaterialUpdate(RawMaterialBase):
    pass

class RawMaterialOut(RawMaterialBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class DubaiPriceBase(BaseModel):
    material_id: int
    date: date
    local_market_price: float

class DubaiPriceCreate(DubaiPriceBase):
    pass

class DubaiPriceOut(DubaiPriceBase):
    id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class InternationalPriceBase(BaseModel):
    material_id: int
    date: date
    fob_price: float
    cif_price: float

class InternationalPriceCreate(InternationalPriceBase):
    pass

class InternationalPriceOut(InternationalPriceBase):
    id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class PriceHistoryReportRequest(BaseModel):
    scope: str
    generated_at: Optional[str] = None
    dates: List[Dict[str, Any]]
