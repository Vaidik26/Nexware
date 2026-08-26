"""
Authentication router — login, logout, current user.

Uses JWT (HS256) signed with the JWT_SECRET_KEY from settings.

Login resolves an identifier against four separate tables in a fixed order
(admin → picker → sales → dashboard) and stamps the winning table's name into
the token as the ``user_type`` claim. Everything downstream trusts that claim to
pick a table, so it must be set here and nowhere else.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import literal, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.config import settings
from backend.database import get_db
from backend.dependencies import get_current_user
from backend.models.users import (
    USER_TYPE_ADMIN,
    USER_TYPE_DASHBOARD,
    USER_TYPE_PICKER,
    USER_TYPE_SALES,
    AdminUser,
    DashboardUser,
    PickerUser,
    SalesUser,
)
from backend.schemas.auth import AnyUserOut, LoginRequest, Token
from backend.services.auth_service import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

#: (user_type, model, identifying column). Order matters: the first table with a
#: matching identifier wins, so identifiers must not be reused across personas.
_LOGIN_ORDER = (
    (USER_TYPE_ADMIN, AdminUser, AdminUser.email),
    (USER_TYPE_PICKER, PickerUser, PickerUser.username),
    (USER_TYPE_SALES, SalesUser, SalesUser.username),
    (USER_TYPE_DASHBOARD, DashboardUser, DashboardUser.email),
)


def _create_access_token(user_id: int, user_type: str) -> str:
    """Create a signed JWT access token for the given user and persona."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "user_type": user_type,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)


async def _find_user_by_identifier(
    identifier: str, db: AsyncSession
) -> Tuple[Optional[object], Optional[str]]:
    """
    Find which of the four user tables owns this identifier.

    The four lookups are issued as one UNION ALL rather than in sequence. The
    database is remote and a round trip costs far more than the query itself, so
    a sales rep — last but one in the search order — was paying three pointless
    round trips before their own row was even looked at. This resolves the table
    in a single trip, then fetches the row itself in a second.

    Returns ``(user, user_type)`` on the first hit in _LOGIN_ORDER, or ``(None, None)``.
    """
    # Ask every table "do you have this identifier?" at once. Only ids come back;
    # `rank` preserves the original precedence so the winner is unambiguous.
    probes = [
        select(
            model.id.label("id"),
            literal(user_type).label("user_type"),
            literal(rank).label("rank"),
        ).filter(id_column.ilike(identifier))
        for rank, (user_type, model, id_column) in enumerate(_LOGIN_ORDER)
    ]
    result = await db.execute(union_all(*probes).order_by("rank").limit(1))
    hit = result.first()
    if hit is None:
        return None, None

    user_id, user_type = hit.id, hit.user_type
    model = next(m for t, m, _ in _LOGIN_ORDER if t == user_type)
    row = await db.execute(select(model).filter(model.id == user_id))
    return row.scalars().first(), user_type


@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    identifier = login_data.email.strip()
    user, user_type = await _find_user_by_identifier(identifier, db)

    if not user or not verify_password(login_data.password, user.hashed_password):
        logger.warning("Failed login attempt for identifier: %.50s", identifier)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        logger.warning("Inactive account login attempt: %s id=%s", user_type, user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    if user_type == USER_TYPE_SALES:
        user.last_login_at = datetime.now(timezone.utc)
        # No refresh afterwards: the session is configured expire_on_commit=False,
        # so `user` is still fully populated and re-reading it would just be
        # another round trip to the remote database.
        await db.commit()

    token = _create_access_token(user.id, user_type)
    user.user_type = user_type
    logger.info("User logged in: id=%s user_type=%s", user.id, user_type)

    return {
        "token": token,
        "access_token": token,  # alias for frontend compatibility
        "token_type": "bearer",
        "user_type": user_type,
        "user": user,
    }


@router.post("/logout")
async def logout(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Only pickers carry a push token — clearing it stops the device receiving
    # push notifications after logout. Other personas have nothing to clear.
    if isinstance(current_user, PickerUser) and current_user.push_token:
        current_user.push_token = None
        await db.commit()
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=AnyUserOut)
async def read_users_me(current_user=Depends(get_current_user)):
    return current_user
