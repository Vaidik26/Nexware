from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, func, UniqueConstraint
from backend.database import Base

class RawMaterial(Base):
    __tablename__ = "raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    material_code = Column(String, unique=True, index=True, nullable=False)
    material_name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    market_type = Column(String, nullable=True) # 'DXB', 'INT', or 'BOTH'
    bag_carton_weight = Column(Float, nullable=False)
    weight_unit = Column(String, nullable=False, default="kg", server_default="kg")

class MarketPrice(Base):
    __tablename__ = "market_prices"
    __table_args__ = (UniqueConstraint('material_id', 'date', 'market', 'price_type', name='uq_market_price_date'),)

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    date = Column(Date, nullable=False)
    price = Column(Float, nullable=False)
    market = Column(String, nullable=False) # 'DXB' or 'INT'
    price_type = Column(String, nullable=False) # 'LOC', 'FOB', 'CIF'
    currency = Column(String, nullable=False) # 'USD', 'AED', 'OMR'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
