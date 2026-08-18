from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, func, nulls_last
from sqlalchemy.orm import relationship
from backend.database import Base

class PickList(Base):
    __tablename__ = "pick_lists"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, nullable=False)
    customer_name = Column(String, nullable=False)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True)
    sales_person_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="draft") # draft, assigned, picking, waiting_verification, verified, completed
    picker_job_number = Column(Integer, nullable=True)  # Per-picker sequence: 1, 2, 3... shown as P-001, P-002
    delivery_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # ── Draft Active Box ──
    active_box_carton_id = Column(Integer, ForeignKey("carton_types.id"), nullable=True)
    from sqlalchemy.dialects.postgresql import JSONB
    active_box_contents = Column(JSONB, nullable=True)

    sales_person = relationship("User", foreign_keys=[sales_person_id], lazy="selectin")

    
    items = relationship(
        "PickListItem", 
        back_populates="pick_list", 
        cascade="all, delete-orphan", 
        lazy="selectin",
        order_by=lambda: [
            nulls_last(func.substr(PickListItem.bin_location, 1, 2)),
            PickListItem.is_full_carton.desc(),
            nulls_last(PickListItem.bin_location)
        ]
    )
    assignments = relationship("PickAssignment", back_populates="pick_list", cascade="all, delete-orphan", lazy="selectin")
    boxes = relationship("PickListBox", back_populates="pick_list", cascade="all, delete-orphan", lazy="selectin")
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
    picked_quantity = Column(Float, default=0.0)
    unit = Column(String, nullable=False)
    is_picked = Column(Boolean, default=False)
    picked_at = Column(DateTime(timezone=True), nullable=True)
    is_audited = Column(Boolean, default=False)
    is_full_carton = Column(Boolean, default=True)
    box_id = Column(Integer, ForeignKey("pick_list_boxes.id"), nullable=True)
    missing_reported = Column(Boolean, default=False)
    missing_approved = Column(Boolean, nullable=True)
    bin_location = Column(String, nullable=True)

    pick_list = relationship("PickList", back_populates="items")
    box = relationship("PickListBox", back_populates="items")
    box_item_entries = relationship("PickListBoxItem", back_populates="item", cascade="all, delete-orphan", lazy="selectin")

class PickListBox(Base):
    __tablename__ = "pick_list_boxes"

    id = Column(Integer, primary_key=True, index=True)
    pick_list_id = Column(Integer, ForeignKey("pick_lists.id"), nullable=False)
    carton_type_id = Column(Integer, ForeignKey("carton_types.id"), nullable=False)
    entered_weight = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_audited = Column(Boolean, default=False)

    pick_list = relationship("PickList", back_populates="boxes")
    items = relationship("PickListItem", back_populates="box")  # legacy direct link (full cartons)
    box_items = relationship("PickListBoxItem", back_populates="box", cascade="all, delete-orphan", lazy="selectin")
    carton_type = relationship("CartonType", lazy="selectin")


class PickListBoxItem(Base):
    """Maps which item (and how much) went into a specific box.
    Used for loose items that are packed at the weighing station.
    A single PickListItem can appear in multiple boxes (split quantity).
    """
    __tablename__ = "pick_list_box_items"

    id = Column(Integer, primary_key=True, index=True)
    box_id = Column(Integer, ForeignKey("pick_list_boxes.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("pick_list_items.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)

    box = relationship("PickListBox", back_populates="box_items")
    item = relationship("PickListItem", back_populates="box_item_entries")

class PickAssignment(Base):
    __tablename__ = "pick_assignments"

    id = Column(Integer, primary_key=True, index=True)
    pick_list_id = Column(Integer, ForeignKey("pick_lists.id"), nullable=False)
    picker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    pick_list = relationship("PickList", back_populates="assignments")
    picker = relationship("User", lazy="selectin")

