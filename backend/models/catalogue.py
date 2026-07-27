from sqlalchemy import Column, Integer, String
from backend.database import Base

class SalesItem(Base):
    __tablename__ = "sales_items"

    id = Column(Integer, primary_key=True, index=True)
    item_number = Column(String, unique=True, index=True, nullable=False)
    item_name = Column(String, nullable=False)
    barcode = Column(String, unique=True, index=True, nullable=False)
    unit = Column(String, nullable=False)

