from sqlalchemy import Column, Integer, String, Float
from backend.database import Base

class SalesItem(Base):
    __tablename__ = "sales_items"

    id = Column(Integer, primary_key=True, index=True)
    item_number = Column(String, unique=True, index=True, nullable=False)
    item_name = Column(String, nullable=False)
    barcode = Column(String, unique=True, index=True, nullable=False)
    unit = Column(String, nullable=False)
    bin_location = Column(String, nullable=True)
    standard_carton_quantity = Column(Integer, default=1)
    packaging_weight = Column(Float, default=0.0)
    sku_size_category = Column(String, default=">100g")
    available_quantity = Column(Integer, default=0)

class CartonType(Base):
    __tablename__ = "carton_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    tare_weight = Column(Float, nullable=False) # weight of the empty carton in kg

