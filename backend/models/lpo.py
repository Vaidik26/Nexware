from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database import Base

class Lpo(Base):
    __tablename__ = "lpos"

    id = Column(Integer, primary_key=True, index=True)
    lpo_number = Column(String, unique=True, index=True, nullable=False)
    customer_name = Column(String, nullable=False)
    sales_person_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Store items as JSON [{barcode, product_name, quantity, unit}]
    items = Column(JSON, nullable=False, default=[])
    
    # The URL to the signed LPO or invoice uploaded by the Sales Person
    signed_lpo_url = Column(String, nullable=True)
    
    # status: 'draft', 'processed'
    status = Column(String, default="draft")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to user
    sales_person = relationship("User", foreign_keys=[sales_person_id])
