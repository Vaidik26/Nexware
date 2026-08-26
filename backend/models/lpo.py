from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.database import Base


class Lpo(Base):
    """
    A Local Purchase Order.

    Note the two identifiers. ``lpo_number`` is the *customer's* document number,
    typed in on mobile or read off the uploaded PDF — it is business data and is
    never generated. ``internal_ref`` is ours: a generated ``LPO-YYMM-XXXX`` short
    id used for internal reference and guaranteed collision-free by the unique
    constraint plus the retry loop at the insert site.
    """

    __tablename__ = "lpos"

    id = Column(Integer, primary_key=True, index=True)

    lpo_number = Column(String, unique=True, index=True, nullable=False)
    internal_ref = Column(String, unique=True, index=True, nullable=False)

    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)

    # nullable: admin manual orders may not have a sales person
    sales_person_id = Column(Integer, ForeignKey("sales_users.id"), nullable=True, index=True)
    # set when an admin raises the LPO from the portal rather than a rep from mobile
    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)

    # The URL to the signed LPO or invoice uploaded by the Sales Person
    signed_lpo_url = Column(String, nullable=True)

    # status: 'draft' | 'pending' | 'approved' | 'disapproved' | 'processed'
    status = Column(String, default="pending")

    # source: 'upload' | 'manual' | 'mobile'
    source = Column(String, default="upload")

    delivery_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", lazy="joined")
    sales_person = relationship("SalesUser", foreign_keys=[sales_person_id], lazy="joined")
    created_by_admin = relationship("AdminUser", foreign_keys=[created_by_admin_id], lazy="joined")

    items = relationship(
        "LpoItem",
        back_populates="lpo",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def customer_name(self):
        """Read-through to the related customer, for API responses."""
        return self.customer.name if self.customer else None

    @property
    def created_by_name(self):
        if self.created_by_admin:
            return self.created_by_admin.full_name or self.created_by_admin.email
        if self.sales_person:
            return self.sales_person.display_name or self.sales_person.username
        return None


class LpoItem(Base):
    """
    One ordered line of an LPO. Replaces the old ``Lpo.items`` JSON blob.

    ``product_id`` is nullable on purpose: an LPO can legitimately name a barcode
    that is not in the catalogue yet (the picking flow already handles this by
    treating the line as unmatched). ``barcode`` is what the document actually
    said and is kept verbatim so an unmatched line can still be reconciled later.
    """

    __tablename__ = "lpo_items"

    id = Column(Integer, primary_key=True, index=True)
    lpo_id = Column(
        Integer, ForeignKey("lpos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True, index=True)

    barcode = Column(String, nullable=False, index=True)
    # Falls back to the description on the document when product_id is unresolved.
    description = Column(String, nullable=True)
    quantity = Column(Float, nullable=False, default=1)
    unit = Column(String, nullable=False, default="PCS")

    lpo = relationship("Lpo", back_populates="items")
    product = relationship("Product", lazy="joined")

    @property
    def product_name(self):
        """Read-through to the related product, falling back to the document text."""
        if self.product:
            return self.product.name
        return self.description
