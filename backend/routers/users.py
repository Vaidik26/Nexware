"""
User management.

The monolithic ``/users`` collection is gone: each persona now has its own
table, so each gets its own route group — ``/admins``, ``/pickers``, ``/sales``
and ``/dashboard-users``.

WHO MAY MANAGE USERS. Every write here is gated on the ``USER_ADMIN`` module
rather than on the admin persona, because holding USER_ADMIN is exactly what
that module means and a DEV or PROCUREMENT_MANAGER dashboard account holds it by role
default. The gate still admits every admin — :data:`PORTAL_OWNER` gives them
every module — so nothing an admin could do before is refused now.

The consequence to keep in mind: ``current_user`` on these endpoints is no
longer necessarily an :class:`AdminUser`. Anywhere that compares it against a
row being edited must check the type first; an id alone identifies nobody now
that four tables each have one.

They are exposed as one ``router`` object so main.py's mounting loop is
unchanged; the sub-routers each declare their own prefix.
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.constants import ACTIVE_PICK_STATUSES, PortalModule
from backend.core.access import refuse_grant
from backend.database import get_db
from backend.dependencies import get_current_picker, get_current_user, require_module
from backend.models.picklist import Picklist, PicklistAssignment
from backend.models.users import AdminUser, DashboardUser, PickerUser, SalesUser
from backend.schemas.access import GrantIn
from backend.schemas.auth import (
    AdminCreate,
    AdminOut,
    AdminUpdate,
    DashboardCreate,
    DashboardOut,
    DashboardUpdate,
    PickerCreate,
    PickerOut,
    PickerUpdate,
    SalesCreate,
    SalesOut,
    SalesUpdate,
)
from backend.services.access_service import replace_grants
from backend.services.auth_service import hash_password

logger = logging.getLogger(__name__)

router = APIRouter()

admins_router = APIRouter(prefix="/admins", tags=["users:admins"])
pickers_router = APIRouter(prefix="/pickers", tags=["users:pickers"])
sales_router = APIRouter(prefix="/sales", tags=["users:sales"])
dashboard_router = APIRouter(prefix="/dashboard-users", tags=["users:dashboard"])

#: The gate on every user-management route. Built once — ``require_module``
#: returns a new function each call, and FastAPI caches a dependency per
#: callable identity, so building it inline would resolve the caller's access
#: once per endpoint instead of once per request.
user_admin = require_module(PortalModule.USER_ADMIN)


async def _reject_duplicate(db: AsyncSession, column, value: str, label: str, exclude_id=None):
    """Raise 400 if ``value`` already occupies ``column`` on another row."""
    stmt = select(column).filter(column.ilike(value))
    result = await db.execute(stmt)
    if result.scalars().first() is not None:
        raise HTTPException(status_code=400, detail=f"{label} '{value}' is already in use")
    _ = exclude_id  # the ilike lookup is on a unique column; caller checks for change first


async def _reject_duplicate_email(db: AsyncSession, email: str, exclude_model=None, exclude_id=None) -> None:
    """
    Raise 400 if the email is already registered in ANY of the email-login tables
    (admin_users, dashboard_users). This prevents a single person holding accounts
    in two different roles under the same address, which would make the login screen
    ambiguous and the audit trail unreliable.
    """
    email = email.strip().lower()
    for model in (AdminUser, DashboardUser):
        if exclude_model is model:
            # When editing, allow the row being edited to keep its own email
            stmt = select(model.email).filter(
                model.email.ilike(email), model.id != exclude_id
            )
        else:
            stmt = select(model.email).filter(model.email.ilike(email))
        result = await db.execute(stmt)
        if result.scalars().first() is not None:
            table_label = "Admin" if model is AdminUser else "Dashboard Viewer"
            raise HTTPException(
                status_code=400,
                detail=f"Email '{email}' is already registered as a {table_label} account.",
            )


async def _reject_duplicate_username(db: AsyncSession, username: str, exclude_model=None, exclude_id=None) -> None:
    """
    Raise 400 if the username is already registered in ANY of the username-login tables
    (picker_users, sales_users). Pickers and Sales Reps both log in with a username,
    so sharing one would make their tokens indistinguishable.
    """
    username = username.strip().lower()
    for model in (PickerUser, SalesUser):
        if exclude_model is model:
            stmt = select(model.username).filter(
                model.username.ilike(username), model.id != exclude_id
            )
        else:
            stmt = select(model.username).filter(model.username.ilike(username))
        result = await db.execute(stmt)
        if result.scalars().first() is not None:
            table_label = "Picker" if model is PickerUser else "Sales Rep"
            raise HTTPException(
                status_code=400,
                detail=f"Username '{username}' is already registered as a {table_label} account.",
            )


def _reject_bad_grant(data: GrantIn) -> None:
    """
    Refuse an unstorable area grant with a sentence, before anything is written.

    The database's CHECK constraints enforce the same rule, but letting the
    request reach them turns an explainable refusal into a constraint-violation
    traceback.
    """
    problem = refuse_grant(data.areas or [], data.channel)
    if problem:
        raise HTTPException(status_code=400, detail=problem)


# ─── Admins ────────────────────────────────────────────────────────────────────

@admins_router.get("", response_model=List[AdminOut])
@admins_router.get("/", response_model=List[AdminOut])
async def list_admins(db: AsyncSession = Depends(get_db), _=Depends(user_admin)):
    result = await db.execute(select(AdminUser).order_by(AdminUser.id))
    return result.scalars().all()


@admins_router.post("", response_model=AdminOut, status_code=status.HTTP_201_CREATED)
@admins_router.post("/", response_model=AdminOut, status_code=status.HTTP_201_CREATED)
async def create_admin(
    data: AdminCreate, db: AsyncSession = Depends(get_db), _=Depends(user_admin)
):
    email = data.email.strip()
    await _reject_duplicate_email(db, email)

    admin = AdminUser(
        email=email,
        full_name=data.full_name.strip(),
        hashed_password=hash_password(data.password),
        is_active=data.is_active,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    logger.info("Admin created: id=%s", admin.id)
    return admin


@admins_router.patch("/{admin_id}", response_model=AdminOut)
async def update_admin(
    admin_id: int,
    data: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(user_admin),
):
    result = await db.execute(select(AdminUser).filter(AdminUser.id == admin_id))
    admin = result.scalars().first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    if data.email and data.email.strip().lower() != admin.email.lower():
        await _reject_duplicate_email(db, data.email.strip(), exclude_model=AdminUser, exclude_id=admin_id)
        admin.email = data.email.strip()
    if data.full_name:
        admin.full_name = data.full_name.strip()
    if data.password:
        admin.hashed_password = hash_password(data.password)
    if data.is_active is not None:
        admin.is_active = data.is_active

    await db.commit()
    await db.refresh(admin)
    return admin


@admins_router.delete("/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    caller=Depends(user_admin),
):
    # The caller is whoever holds USER_ADMIN, which is no longer necessarily an
    # admin. Comparing a bare id would be wrong for anyone else: dashboard user
    # 3 is not admin 3, and matching them would refuse a delete that is not a
    # self-delete at all.
    if isinstance(caller, AdminUser) and admin_id == caller.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    result = await db.execute(select(AdminUser).filter(AdminUser.id == admin_id))
    admin = result.scalars().first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    await db.delete(admin)
    await db.commit()


# ─── Pickers ───────────────────────────────────────────────────────────────────

@pickers_router.get("", response_model=List[PickerOut])
@pickers_router.get("/", response_model=List[PickerOut])
async def list_pickers(
    only_available: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    stmt = select(PickerUser)
    if only_available:
        stmt = stmt.filter(PickerUser.is_active.is_(True), PickerUser.is_available.is_(True))
    result = await db.execute(stmt.order_by(PickerUser.id))
    return result.scalars().all()


@pickers_router.post("", response_model=PickerOut, status_code=status.HTTP_201_CREATED)
@pickers_router.post("/", response_model=PickerOut, status_code=status.HTTP_201_CREATED)
async def create_picker(
    data: PickerCreate, db: AsyncSession = Depends(get_db), _=Depends(user_admin)
):
    username = data.username.strip()
    await _reject_duplicate_username(db, username)

    picker = PickerUser(
        username=username,
        full_name=data.full_name.strip(),
        hashed_password=hash_password(data.password),
        is_available=data.is_available,
        is_active=data.is_active,
    )
    db.add(picker)
    await db.commit()
    await db.refresh(picker)
    logger.info("Picker created: id=%s", picker.id)
    return picker


class PushTokenBody(BaseModel):
    token: str


@pickers_router.post("/me/push-token")
async def register_push_token(
    body: PushTokenBody,
    db: AsyncSession = Depends(get_db),
    current_picker: PickerUser = Depends(get_current_picker),
):
    """
    Register the device's Expo push token.

    This moved here from the deleted notifications router. The in-app feed is
    gone — live updates come over the WebSocket now — but push still matters: it
    is the only channel that reaches a picker whose app is closed.
    """
    current_picker.push_token = body.token
    await db.commit()
    return {"message": "Push token updated"}


@pickers_router.patch("/me/status", response_model=PickerOut)
async def update_my_availability(
    is_available: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """A picker toggling their own availability from the mobile app."""
    if not isinstance(current_user, PickerUser):
        raise HTTPException(status_code=403, detail="Only pickers have an availability status")
    current_user.is_available = is_available
    await db.commit()
    await db.refresh(current_user)
    return current_user


@pickers_router.patch("/{picker_id}", response_model=PickerOut)
async def update_picker(
    picker_id: int,
    data: PickerUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(user_admin),
):
    result = await db.execute(select(PickerUser).filter(PickerUser.id == picker_id))
    picker = result.scalars().first()
    if not picker:
        raise HTTPException(status_code=404, detail="Picker not found")

    if data.username and data.username.strip().lower() != picker.username.lower():
        await _reject_duplicate_username(db, data.username.strip(), exclude_model=PickerUser, exclude_id=picker_id)
        picker.username = data.username.strip()
    if data.full_name:
        picker.full_name = data.full_name.strip()
    if data.password:
        picker.hashed_password = hash_password(data.password)
    if data.is_available is not None:
        picker.is_available = data.is_available
    if data.is_active is not None:
        picker.is_active = data.is_active

    await db.commit()
    await db.refresh(picker)
    return picker


@pickers_router.patch("/{picker_id}/status", response_model=PickerOut)
async def update_picker_status(
    picker_id: int,
    is_available: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(user_admin),
):
    result = await db.execute(select(PickerUser).filter(PickerUser.id == picker_id))
    picker = result.scalars().first()
    if not picker:
        raise HTTPException(status_code=404, detail="Picker not found")
    picker.is_available = is_available
    await db.commit()
    await db.refresh(picker)
    return picker


@pickers_router.delete("/{picker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_picker(
    picker_id: int, db: AsyncSession = Depends(get_db), _=Depends(user_admin)
):
    result = await db.execute(select(PickerUser).filter(PickerUser.id == picker_id))
    picker = result.scalars().first()
    if not picker:
        raise HTTPException(status_code=404, detail="Picker not found")

    # Safeguard: never orphan an in-flight picking job
    ongoing = await db.execute(
        select(PicklistAssignment.id)
        .join(Picklist, PicklistAssignment.picklist_id == Picklist.id)
        .filter(
            PicklistAssignment.picker_id == picker_id,
            Picklist.status.in_(ACTIVE_PICK_STATUSES),
        )
    )
    if ongoing.scalars().first():
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot delete picker: they have active picklist assignments. "
                "Reassign or complete their tasks first."
            ),
        )

    await db.delete(picker)
    await db.commit()


# ─── Sales users ───────────────────────────────────────────────────────────────

@sales_router.get("", response_model=List[SalesOut])
@sales_router.get("/", response_model=List[SalesOut])
async def list_sales_users(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(SalesUser).order_by(SalesUser.id))
    return result.scalars().all()


@sales_router.post("", response_model=SalesOut, status_code=status.HTTP_201_CREATED)
@sales_router.post("/", response_model=SalesOut, status_code=status.HTTP_201_CREATED)
async def create_sales_user(
    data: SalesCreate, db: AsyncSession = Depends(get_db), _=Depends(user_admin)
):
    username = data.username.strip()
    await _reject_duplicate_username(db, username)

    sales_user = SalesUser(
        username=username,
        display_name=data.display_name.strip(),
        hashed_password=hash_password(data.password),
        is_active=data.is_active,
    )
    db.add(sales_user)
    await db.commit()
    await db.refresh(sales_user)
    logger.info("Sales user created: id=%s", sales_user.id)
    return sales_user


@sales_router.patch("/{sales_id}", response_model=SalesOut)
async def update_sales_user(
    sales_id: int,
    data: SalesUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(user_admin),
):
    result = await db.execute(select(SalesUser).filter(SalesUser.id == sales_id))
    sales_user = result.scalars().first()
    if not sales_user:
        raise HTTPException(status_code=404, detail="Sales user not found")

    if data.username and data.username.strip().lower() != sales_user.username.lower():
        await _reject_duplicate_username(db, data.username.strip(), exclude_model=SalesUser, exclude_id=sales_id)
        sales_user.username = data.username.strip()
    if data.display_name:
        sales_user.display_name = data.display_name.strip()
    if data.password:
        sales_user.hashed_password = hash_password(data.password)
    if data.is_active is not None:
        sales_user.is_active = data.is_active

    await db.commit()
    await db.refresh(sales_user)
    return sales_user


@sales_router.delete("/{sales_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sales_user(
    sales_id: int, db: AsyncSession = Depends(get_db), _=Depends(user_admin)
):
    result = await db.execute(select(SalesUser).filter(SalesUser.id == sales_id))
    sales_user = result.scalars().first()
    if not sales_user:
        raise HTTPException(status_code=404, detail="Sales user not found")

    await db.delete(sales_user)
    await db.commit()


# ─── Dashboard users ───────────────────────────────────────────────────────────

@dashboard_router.get("", response_model=List[DashboardOut])
@dashboard_router.get("/", response_model=List[DashboardOut])
async def list_dashboard_users(db: AsyncSession = Depends(get_db), _=Depends(user_admin)):
    result = await db.execute(select(DashboardUser).order_by(DashboardUser.id))
    return result.scalars().all()


@dashboard_router.post("", response_model=DashboardOut, status_code=status.HTTP_201_CREATED)
@dashboard_router.post("/", response_model=DashboardOut, status_code=status.HTTP_201_CREATED)
async def create_dashboard_user(
    data: DashboardCreate, db: AsyncSession = Depends(get_db), _=Depends(user_admin)
):
    email = data.email.strip()
    await _reject_duplicate_email(db, email)
    _reject_bad_grant(data)

    user = DashboardUser(
        email=email,
        full_name=data.full_name.strip(),
        hashed_password=hash_password(data.password),
        role=data.role.value,
        is_active=data.is_active,
        # Initialised explicitly, empty, so the relationship counts as LOADED.
        area_grants=[],
    )
    db.add(user)
    await db.flush()
    await replace_grants(db, user, data.areas, data.channel)

    await db.commit()
    await db.refresh(user)
    logger.info("Dashboard user created: id=%s role=%s", user.id, user.role)
    return user


@dashboard_router.patch("/{user_id}", response_model=DashboardOut)
async def update_dashboard_user(
    user_id: int,
    data: DashboardUpdate,
    db: AsyncSession = Depends(get_db),
    caller=Depends(user_admin),
):
    result = await db.execute(select(DashboardUser).filter(DashboardUser.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Dashboard user not found")

    # Self-edit lock. Widening or narrowing your OWN access is the one change a
    # user administrator must not make alone: it turns a single compromised or
    # mistaken session into a permanent escalation, and it lets the last
    # USER_ADMIN holder lock the screen away from everybody. Everything else on
    # the form stays editable — a name and a password are not access.
    editing_self = isinstance(caller, DashboardUser) and caller.id == user.id
    changes_access = (
        data.role is not None or data.areas is not None
    )
    if editing_self and changes_access:
        raise HTTPException(
            status_code=400,
            detail=(
                "You cannot change your own role or grants. Ask another user "
                "administrator to make this change."
            ),
        )

    _reject_bad_grant(data)

    if data.email and data.email.strip().lower() != user.email.lower():
        await _reject_duplicate_email(db, data.email.strip(), exclude_model=DashboardUser, exclude_id=user_id)
        user.email = data.email.strip()
    if data.full_name:
        user.full_name = data.full_name.strip()
    if data.password:
        user.hashed_password = hash_password(data.password)
    if data.role is not None:
        user.role = data.role.value
    if data.is_active is not None:
        user.is_active = data.is_active

    await replace_grants(db, user, data.areas, data.channel)

    await db.commit()
    await db.refresh(user)
    return user


@dashboard_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard_user(
    user_id: int, db: AsyncSession = Depends(get_db), _=Depends(user_admin)
):
    result = await db.execute(select(DashboardUser).filter(DashboardUser.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Dashboard user not found")

    await db.delete(user)
    await db.commit()


for _sub in (admins_router, pickers_router, sales_router, dashboard_router):
    router.include_router(_sub)
