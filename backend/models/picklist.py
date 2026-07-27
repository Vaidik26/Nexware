from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, func
from sqlalchemy.orm import relationship
from backend.database import Base

class PickList(Base):
    __tablename__ = "pick_lists"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, nullable=False)
    customer_name = Column(String, nullable=False)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True)
    status = Column(String, default="draft") # draft, assigned, picking, waiting_verification, verified, completed
    picker_job_number = Column(Integer, nullable=True)  # Per-picker sequence: 1, 2, 3... shown as P-001, P-002
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    items = relationship("PickListItem", back_populates="pick_list", cascade="all, delete-orphan", lazy="selectin")
    assignments = relationship("PickAssignment", back_populates="pick_list", cascade="all, delete-orphan", lazy="selectin")

    @property
    def assigned_picker_id(self):
        if self.assignments and len(self.assignments) > 0:
            return self.assignments[-1].picker_id
        return None

    @property
    def assigned_picker_name(self):
        if self.assignments and len(self.assignments) > 0:
            assign = self.assignments[-1]
            if hasattr(assign, "picker") and assign.picker:
                return assign.picker.full_name or assign.picker.name or assign.picker.email
        return None

class PickListItem(Base):
    __tablename__ = "pick_list_items"

    id = Column(Integer, primary_key=True, index=True)
    pick_list_id = Column(Integer, ForeignKey("pick_lists.id"), nullable=False)
    barcode = Column(String, nullable=False)
    product_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    is_picked = Column(Boolean, default=False)
    picked_at = Column(DateTime(timezone=True), nullable=True)

    pick_list = relationship("PickList", back_populates="items")

class PickAssignment(Base):
    __tablename__ = "pick_assignments"

    id = Column(Integer, primary_key=True, index=True)
    pick_list_id = Column(Integer, ForeignKey("pick_lists.id"), nullable=False)
    picker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    pick_list = relationship("PickList", back_populates="assignments")
    picker = relationship("User", lazy="selectin")
