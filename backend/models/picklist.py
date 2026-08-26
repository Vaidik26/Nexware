from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
    nulls_last,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from backend.database import Base


class Picklist(Base):
    """
    A picking job. Customer and sales person are strict FKs — their names are
    resolved through the relationships at serialisation time rather than being
    copied into this table.
    """

    __tablename__ = "picklists"

    id = Column(Integer, primary_key=True, index=True)

    # Human-facing short id, e.g. PL-2408-9F3A. Generated via
    # backend.core.utils.generate_prefixed_id with retry on collision.
    picklist_number = Column(String, unique=True, index=True, nullable=False)

    # The customer's own order reference, carried over from the LPO or sales
    # order. Not unique — a customer may reuse or resend a number.
    order_number = Column(String, nullable=False)

    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True, index=True)
    sales_person_id = Column(Integer, ForeignKey("sales_users.id"), nullable=True, index=True)

    # draft, assigned, picking, waiting_verification, verified, completed
    status = Column(String, default="draft")
    picker_job_number = Column(Integer, nullable=True)  # per-picker sequence, shown as P-001
    delivery_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ── Draft Active Box ──
    active_box_carton_id = Column(Integer, ForeignKey("carton_types.id"), nullable=True, index=True)
    active_box_contents = Column(JSONB, nullable=True)

    customer = relationship("Customer", lazy="joined")
    sales_person = relationship("SalesUser", foreign_keys=[sales_person_id], lazy="joined")

    items = relationship(
        "PicklistItem",
        back_populates="picklist",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by=lambda: [
            nulls_last(func.substr(PicklistItem.bin_location, 1, 2)),
            PicklistItem.is_full_carton.desc(),
            nulls_last(PicklistItem.bin_location),
        ],
    )
    assignments = relationship(
        "PicklistAssignment",
        back_populates="picklist",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    boxes = relationship(
        "PicklistBox",
        back_populates="picklist",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def customer_name(self):
        """Read-through to the related customer, for API responses."""
        return self.customer.name if self.customer else None

    @property
    def sales_person_name(self):
        return self.sales_person.display_name if self.sales_person else None

    @property
    def assigned_picker_id(self):
        if self.assignments:
            return self.assignments[-1].picker_id
        return None

    @property
    def assigned_picker_name(self):
        if self.assignments:
            picker = self.assignments[-1].picker
            if picker:
                return picker.full_name or picker.username
        return None


class PicklistItem(Base):
    """
    One line of a picking job.

    ``product_id`` is the strict FK; ``barcode`` is retained deliberately and is
    not denormalisation. A single product is split into two lines — a full-carton
    line carrying the product's primary barcode and a loose line carrying its
    secondary barcode — so this column records *which* of the product's two
    barcodes the picker must scan for this line. ``is_full_carton`` says which
    kind of line it is; ``barcode`` says what the scanner should match.
    """

    __tablename__ = "picklist_items"

    id = Column(Integer, primary_key=True, index=True)
    picklist_id = Column(
        Integer, ForeignKey("picklists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    barcode = Column(String, nullable=False, index=True)

    quantity = Column(Float, nullable=False)
    picked_quantity = Column(Float, default=0.0)
    unit = Column(String, nullable=False)
    is_picked = Column(Boolean, default=False)
    picked_at = Column(DateTime(timezone=True), nullable=True)
    is_audited = Column(Boolean, default=False)
    is_full_carton = Column(Boolean, default=True)
    box_id = Column(Integer, ForeignKey("picklist_boxes.id"), nullable=True, index=True)
    missing_reported = Column(Boolean, default=False)
    missing_approved = Column(Boolean, nullable=True)
    bin_location = Column(String, nullable=True)

    picklist = relationship("Picklist", back_populates="items")
    product = relationship("Product", lazy="joined")
    box = relationship("PicklistBox", back_populates="items", foreign_keys=[box_id])
    box_item_entries = relationship(
        "PicklistBoxItem",
        back_populates="item",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def product_name(self):
        """Read-through to the related product, for API responses."""
        return self.product.name if self.product else None


class PicklistBox(Base):
    __tablename__ = "picklist_boxes"

    id = Column(Integer, primary_key=True, index=True)
    picklist_id = Column(
        Integer, ForeignKey("picklists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    carton_type_id = Column(Integer, ForeignKey("carton_types.id"), nullable=False, index=True)
    entered_weight = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_audited = Column(Boolean, default=False)

    picklist = relationship("Picklist", back_populates="boxes")
    items = relationship(
        "PicklistItem",
        back_populates="box",
        foreign_keys=[PicklistItem.box_id],
        lazy="selectin",
    )  # legacy direct link (full cartons)
    box_items = relationship(
        "PicklistBoxItem",
        back_populates="box",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    carton_type = relationship("CartonType", lazy="joined")


class PicklistBoxItem(Base):
    """Maps which item (and how much) went into a specific box.

    Used for loose items that are packed at the weighing station.
    A single PicklistItem can appear in multiple boxes (split quantity).
    """

    __tablename__ = "picklist_box_items"

    id = Column(Integer, primary_key=True, index=True)
    box_id = Column(
        Integer, ForeignKey("picklist_boxes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id = Column(
        Integer, ForeignKey("picklist_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity = Column(Float, nullable=False)

    box = relationship("PicklistBox", back_populates="box_items")
    item = relationship("PicklistItem", back_populates="box_item_entries")


class PicklistAssignment(Base):
    __tablename__ = "picklist_assignments"

    id = Column(Integer, primary_key=True, index=True)
    picklist_id = Column(
        Integer, ForeignKey("picklists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    picker_id = Column(Integer, ForeignKey("picker_users.id"), nullable=False, index=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    picklist = relationship("Picklist", back_populates="assignments")
    picker = relationship("PickerUser", lazy="joined")
