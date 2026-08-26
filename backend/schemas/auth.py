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
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


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


class DashboardCreate(DashboardBase):
    password: str


class DashboardUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class DashboardOut(DashboardBase):
    id: int
    user_type: Literal["dashboard"] = "dashboard"
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


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
