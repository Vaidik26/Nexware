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
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from backend.constants import ALL_AREAS, DashboardRole, PortalModule, SalesChannel
from backend.database import Base

#: SQL fragments for the CHECK constraints below, built from the enums so the
#: database and the application cannot drift apart on what a legal value is.
_ROLE_VALUES = ", ".join(f"'{r.value}'" for r in DashboardRole)
_MODULE_VALUES = ", ".join(f"'{m.value}'" for m in PortalModule)
_CHANNEL_VALUES = ", ".join(f"'{c.value}'" for c in SalesChannel)

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
    """
    Portal analytics viewer. Logs in with an email address.

    Unlike the other three personas, what this account can do is not implied by
    the table it lives in: ``role`` names its base permissions and the two grant
    tables below may override them per user. ``backend.core.access`` turns the
    three into one answer — nothing else should combine them.
    """

    __tablename__ = "dashboard_users"
    __table_args__ = (
        CheckConstraint(f"role IN ({_ROLE_VALUES})", name="ck_dashboard_users_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    # The fail-closed role is the default at both layers: a row inserted outside
    # the API gets the role that opens nothing, never one that opens everything.
    role = Column(
        String,
        nullable=False,
        default=DashboardRole.SALES.value,
        server_default=DashboardRole.SALES.value,
    )
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    area_grants = relationship(
        "DashboardUserArea",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class DashboardUserArea(Base):
    """
    One EXPLICIT territory grant: a supervisor area, optionally narrowed to a
    single sales channel.

    ``channel`` NULL means both books, which is what a grant meant before the
    column existed — so an area granted without one keeps the widest reading it
    has always had, rather than silently becoming half of itself.

    ``area`` is stored verbatim. It is matched character-for-character against
    the customer master's supervisor area, so nothing normalises it here: the
    two spellings ``CAPITAL`` and ``CAPITAL 1`` are two different territories.
    """

    __tablename__ = "dashboard_user_areas"
    __table_args__ = (
        UniqueConstraint("user_id", "area", name="uq_dashboard_user_areas_user_area"),
        CheckConstraint(
            f"channel IS NULL OR channel IN ({_CHANNEL_VALUES})",
            name="ck_dashboard_user_areas_channel",
        ),
        # ALL already means every area of both books; pairing it with a channel
        # would be a third, undefined thing. Refused rather than reinterpreted.
        CheckConstraint(
            f"area <> '{ALL_AREAS}' OR channel IS NULL",
            name="ck_dashboard_user_areas_all_has_no_channel",
        ),
        CheckConstraint(
            "length(btrim(area)) > 0", name="ck_dashboard_user_areas_area_not_blank"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("dashboard_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    area = Column(String, nullable=False)
    channel = Column(String, nullable=True)

    user = relationship("DashboardUser", back_populates="area_grants")


#: Maps a JWT ``user_type`` claim to its model. Used by the auth dependencies to
#: pick the right table without a chain of if/elif.
USER_TYPE_MODELS = {
    USER_TYPE_ADMIN: AdminUser,
    USER_TYPE_PICKER: PickerUser,
    USER_TYPE_SALES: SalesUser,
    USER_TYPE_DASHBOARD: DashboardUser,
}
