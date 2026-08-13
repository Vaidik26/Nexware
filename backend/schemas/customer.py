from datetime import datetime
from pydantic import BaseModel, Field

class CustomerBase(BaseModel):
    customer_code: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    customer_code: str | None = None
    name: str | None = None

class CustomerOut(CustomerBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
