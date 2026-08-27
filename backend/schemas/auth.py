"""
Auth and user schemas.

There is no generic ``UserOut`` any more. Each persona has its own response
model because the four tables no longer share a column set — a single schema
would have to make almost every field optional and would lie about which ones
are ever populated.

Every ``*Out`` carries a literal ``user_type`` so a client can branch on the
response without inspecting which fields happen to be present. The value matches
the JWT ``user_type`` claim.
"""
from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.constants import DashboardRole, PortalModule, SalesChannel
from backend.core.access import resolve
from backend.schemas.access import EffectiveAccessOut, GrantIn


# ─── Admin ─────────────────────────────────────────────────────────────────────

class AdminBase(BaseModel):
    email: str
    full_name: str
    is_active: bool = True


class AdminCreate(AdminBase):
    password: str


class AdminUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class AdminOut(AdminBase):
    id: int
    user_type: Literal["admin"] = "admin"
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# ─── Picker ────────────────────────────────────────────────────────────────────

class PickerBase(BaseModel):
    username: str
    full_name: str
    is_available: bool = True
    is_active: bool = True


class PickerCreate(PickerBase):
    password: str


class PickerUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_available: Optional[bool] = None
    is_active: Optional[bool] = None


class PickerOut(PickerBase):
    id: int
    user_type: Literal["picker"] = "picker"
    push_token: Optional[str] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# ─── Sales ─────────────────────────────────────────────────────────────────────

class SalesBase(BaseModel):
    username: str
    display_name: str
    emp_id: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True


class SalesCreate(SalesBase):
    password: str


class SalesUpdate(BaseModel):
    username: Optional[str] = None
    display_name: Optional[str] = None
    emp_id: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class SalesOut(SalesBase):
    id: int
    user_type: Literal["sales"] = "sales"
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# ─── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardBase(BaseModel):
    email: str
    full_name: str
    is_active: bool = True


class DashboardCreate(DashboardBase, GrantIn):
    """
    A new dashboard account.

    ``role`` is required rather than defaulted: which screens somebody may open
    is not a field to forget. The grant half (``modules`` / ``areas`` /
    ``channel``, inherited from :class:`~backend.schemas.access.GrantIn`) is
    optional — omit it and the account inherits its role's defaults.
    """

    password: str
    role: DashboardRole


class DashboardUpdate(GrantIn):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[DashboardRole] = None
    is_active: Optional[bool] = None


class DashboardOut(DashboardBase):
    """
    A dashboard account, carrying both what was STORED and what it RESOLVES to.

    ``role`` and the two ``explicit_*`` flags describe the stored configuration;
    ``modules``, ``areas`` and ``area_channels`` are the effective answer after
    the hybrid rule. The admin screen needs both — "SALES_DASH (role default)"
    and "SALES_DASH (granted)" are the same access and different rows to edit.

    The resolution happens in the validator below rather than at each call site.
    A DashboardUser is serialised from four different endpoints, and the ORM row
    has no ``modules`` attribute for Pydantic to read — so a caller that forgot
    to resolve would not fail, it would answer ``modules: []`` and tell the
    browser to hide every tile the account is entitled to. Doing it here makes
    that impossible to get wrong once.
    """

    id: int
    user_type: Literal["dashboard"] = "dashboard"
    role: DashboardRole
    modules: List[PortalModule] = Field(default_factory=list)
    areas: List[str] = Field(default_factory=list)
    area_channels: Dict[str, SalesChannel] = Field(default_factory=dict)
    all_areas: bool = False
    explicit_modules: bool = False
    explicit_areas: bool = False
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _resolve_access(cls, data: Any) -> Any:
        """
        Fill the resolved fields from the ORM row's role and grant rows.

        Recognised by the presence of the two grant relationships, so a plain
        dict — a test fixture, a re-validated response — passes through
        untouched and keeps whatever it already says.
        """
        if not (hasattr(data, "module_grants") and hasattr(data, "area_grants")):
            return data

        access = resolve(
            role=data.role,
            explicit_modules=[g.module for g in data.module_grants],
            explicit_areas=[(g.area, g.channel) for g in data.area_grants],
        )
        return {
            "id": data.id,
            "email": data.email,
            "full_name": data.full_name,
            "is_active": data.is_active,
            "created_at": data.created_at,
            "role": data.role,
            "modules": list(access.modules),
            "areas": list(access.areas),
            "area_channels": dict(access.area_channels),
            "all_areas": access.all_areas,
            "explicit_modules": access.explicit_modules,
            "explicit_areas": access.explicit_areas,
        }


# ─── Login ─────────────────────────────────────────────────────────────────────

#: Discriminated union — FastAPI picks the right branch from ``user_type``, so
#: /auth/login and /auth/me can return any persona under one response model.
AnyUserOut = Annotated[
    Union[AdminOut, PickerOut, SalesOut, DashboardOut],
    Field(discriminator="user_type"),
]


class LoginRequest(BaseModel):
    # Named ``email`` for client compatibility; it accepts an email address for
    # admins and dashboard users and a username for pickers and sales reps.
    email: str
    password: str


class Token(BaseModel):
    token: str
    access_token: Optional[str] = None  # Alias for client flexibility
    token_type: str = "bearer"
    user_type: str
    user: AnyUserOut
    #: The caller's resolved portal access, so the first screen after login does
    #: not need a second round trip. It is a CONVENIENCE, not a source of truth:
    #: the client caches the user across reloads and must re-read
    #: ``GET /access/me`` on every boot rather than trust what it stored.
    access: EffectiveAccessOut
