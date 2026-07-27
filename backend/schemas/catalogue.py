from pydantic import BaseModel, ConfigDict
from typing import Optional

class SalesItemBase(BaseModel):
    item_number: str
    item_name: str
    barcode: str
    unit: str


class SalesItemCreate(SalesItemBase):
    pass

class SalesItemOut(SalesItemBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
