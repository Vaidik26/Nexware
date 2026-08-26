"""
Modular user models.

The old monolithic ``users`` table carried admin, picker and sales columns side
by side, most of them NULL for any given row. It is replaced by four narrow
tables, one per persona. Nothing is shared between them except the shape of the
password hash, so each table only carries columns that are always meaningful.

The persona a token belongs to is carried in the JWT ``user_type`` claim — see
``backend.routers.auth`` and ``backend.dependencies``. The claim values are the
``USER_TYPE_*`` constants below; they are part of the token contract and must not
be changed without invalidating every issued token.
"""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, func

from backend.database import Base

USER_TYPE_ADMIN = "admin"
USER_TYPE_PICKER = "picker"
USER_TYPE_SALES = "sales"
USER_TYPE_DASHBOARD = "dashboard"


class AdminUser(Base):
    """Warehouse/portal administrator. Logs in with an email address."""

    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PickerUser(Base):
    """Warehouse picker using the Expo mobile app. Logs in with a username."""

    __tablename__ = "picker_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    # is_available is the picking-queue flag: False while a job is assigned.
    is_available = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    push_token = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SalesUser(Base):
    """Sales representative raising LPOs from the mobile app."""

    __tablename__ = "sales_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    emp_id = Column(String, nullable=True, index=True)
    phone = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DashboardUser(Base):
    """Read-only analytics/dashboard viewer. Logs in with an email address."""

    __tablename__ = "dashboard_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


#: Maps a JWT ``user_type`` claim to its model. Used by the auth dependencies to
#: pick the right table without a chain of if/elif.
USER_TYPE_MODELS = {
    USER_TYPE_ADMIN: AdminUser,
    USER_TYPE_PICKER: PickerUser,
    USER_TYPE_SALES: SalesUser,
    USER_TYPE_DASHBOARD: DashboardUser,
}
