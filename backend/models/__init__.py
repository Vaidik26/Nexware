"""
Model registry.

Every model must be imported here so that ``Base.metadata`` is complete before
Alembic autogenerates a migration — a model that is only imported by the router
that uses it is invisible to autogenerate and silently omitted from the schema.
"""
from backend.database import Base
from backend.models.users import (
    AdminUser,
    DashboardUser,
    PickerUser,
    SalesUser,
    USER_TYPE_MODELS,
)
from backend.models.notification import Notification
from backend.models.products import CartonType, Product
from backend.models.order import SalesOrder
from backend.models.customer import Customer
from backend.models.picklist import (
    Picklist,
    PicklistAssignment,
    PicklistBox,
    PicklistBoxItem,
    PicklistItem,
)
from backend.models.market import CapturedPrice, RawMaterial
from backend.models.lpo import Lpo, LpoItem

__all__ = [
    "Base",
    "AdminUser",
    "PickerUser",
    "SalesUser",
    "DashboardUser",
    "USER_TYPE_MODELS",
    "Notification",
    "Product",
    "CartonType",
    "SalesOrder",
    "Customer",
    "Picklist",
    "PicklistItem",
    "PicklistBox",
    "PicklistBoxItem",
    "PicklistAssignment",
    "RawMaterial",
    "CapturedPrice",
    "Lpo",
    "LpoItem",
]
