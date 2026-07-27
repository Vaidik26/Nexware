from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, func, UniqueConstraint
from backend.database import Base

class RawMaterial(Base):
    __tablename__ = "raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    material_code = Column(String, unique=True, index=True, nullable=False)
    material_name = Column(String, nullable=False)
    bag_carton_weight = Column(Float, nullable=False)
    weight_unit = Column(String, nullable=False, default="kg", server_default="kg")

class DubaiPrice(Base):
    __tablename__ = "dubai_prices"
    __table_args__ = (UniqueConstraint('material_id', 'date', name='uq_dubai_price_date'),)

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    date = Column(Date, nullable=False)
    local_market_price = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class InternationalPrice(Base):
    __tablename__ = "international_prices"
    __table_args__ = (UniqueConstraint('material_id', 'date', name='uq_intl_price_date'),)

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    date = Column(Date, nullable=False)
    fob_price = Column(Float, nullable=False)
    cif_price = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
