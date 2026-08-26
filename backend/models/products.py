"""
Product catalogue.

Replaces ``models/catalogue.py``: the ``sales_items`` table is now ``products``
and the model is ``Product``. ``item_number`` became ``product_code`` and
``item_name`` became ``name``.

``CartonType`` moves across unchanged — it is catalogue master data used by the
box-weighing flow, not picking state, so it belongs beside the products it is
weighed with.
"""
from sqlalchemy import Column, Float, Integer, String

from backend.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    product_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)

    # Dual barcodes: the primary is scanned for full cartons, the secondary for
    # loose pieces. Picklist lines record which of the two the picker must scan.
    primary_barcode = Column(String, unique=True, index=True, nullable=False)
    secondary_barcode = Column(String, nullable=True, index=True)

    unit = Column(String, nullable=False)
    bin_location = Column(String, nullable=True)
    standard_carton_quantity = Column(Integer, default=1)
    packaging_weight = Column(Float, default=0.0)
    sku_size_category = Column(String, default=">100g")
    available_quantity = Column(Integer, default=0)
    max_order_quantity = Column(Integer, nullable=True)


class CartonType(Base):
    __tablename__ = "carton_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    tare_weight = Column(Float, nullable=False)  # weight of the empty carton in kg
