from pydantic import BaseModel, ConfigDict
from typing import Optional

class SalesItemBase(BaseModel):
    item_number: str
    item_name: str
    barcode: str
    unit: str
    bin_location: Optional[str] = None
    standard_carton_quantity: int = 1
    packaging_weight: float = 0.0
    sku_size_category: str = ">100g"

class CartonTypeBase(BaseModel):
    name: str
    tare_weight: float

class CartonTypeCreate(CartonTypeBase):
    pass

class CartonTypeOut(CartonTypeBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class SalesItemCreate(SalesItemBase):
    pass

class SalesItemOut(SalesItemBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
