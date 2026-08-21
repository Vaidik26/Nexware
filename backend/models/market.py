from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, func, UniqueConstraint
from backend.database import Base

class RawMaterial(Base):
    __tablename__ = "raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    material_code = Column(String, unique=True, index=True, nullable=False)
    material_name = Column(String, nullable=False)
    bag_carton_weight = Column(String, nullable=True)
    weight_unit = Column(String, nullable=False, default="kg", server_default="kg")
    category = Column(String, nullable=False, default="Uncategorized", server_default="Uncategorized")
    market_type = Column(String, nullable=False, default="BOTH", server_default="BOTH") # DXB, INT, BOTH

class CapturedPrice(Base):
    __tablename__ = "captured_prices"
    __table_args__ = (UniqueConstraint('material_id', 'date', name='uq_captured_price_date'),)

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    date = Column(Date, nullable=False)
    local_price_aed = Column(Float, nullable=True)
    local_price_omr = Column(Float, nullable=True)
    supplier_dubai = Column(String, nullable=True)
    supplier_oman = Column(String, nullable=True)
    fob_price = Column(Float, nullable=True)
    cif_price = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
