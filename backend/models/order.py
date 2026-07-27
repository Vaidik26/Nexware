from sqlalchemy import Column, Integer, String, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from backend.database import Base

class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    extracted_data = Column(JSONB, nullable=False)
    status = Column(String, default="uploaded")
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
