from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any, Dict
from datetime import date, datetime

class RawMaterialBase(BaseModel):
    material_code: str
    material_name: str
    category: Optional[str] = None
    market_type: Optional[str] = None
    bag_carton_weight: float
    weight_unit: Optional[str] = "kg"

class RawMaterialCreate(RawMaterialBase):
    pass

class RawMaterialUpdate(RawMaterialBase):
    pass

class RawMaterialOut(RawMaterialBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class MarketPriceBase(BaseModel):
    material_id: int
    date: date
    price: float
    market: str
    price_type: str
    currency: str

class MarketPriceCreate(MarketPriceBase):
    pass

class MarketPriceOut(MarketPriceBase):
    id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class PriceHistoryReportRequest(BaseModel):
    scope: str
    generated_at: Optional[str] = None
    dates: List[Dict[str, Any]]
