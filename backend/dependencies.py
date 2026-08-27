"""
FastAPI dependency functions for authentication and authorization.

All token validation is done via cryptographic JWT verification (HS256).

Since the monolithic ``users`` table was split into four persona tables, a user
id alone is no longer enough to identify anyone — id 7 exists in all four. Every
token therefore carries a ``user_type`` claim, and that claim alone decides which
table is queried. A token is never looked up in more than one table: if the claim
is missing or unrecognised the token is rejected outright rather than searched
for, so a forged or stale token cannot fall through to the wrong persona.
"""
import logging
from typing import Any, Optional, Tuple

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.config import settings
from backend.constants import PortalModule
from backend.core.access import EffectiveAccess
from backend.database import get_db
from backend.models.users import (
    USER_TYPE_ADMIN,
    USER_TYPE_MODELS,
    USER_TYPE_PICKER,
    USER_TYPE_SALES,
    AdminUser,
    PickerUser,
    SalesUser,
)
from backend.services.access_service import access_for

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

_FORBIDDEN_EXCEPTION = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Insufficient permissions",
)


async def _decode_and_fetch_user(
    token: Optional[str],
    db: AsyncSession,
) -> Tuple[Optional[Any], Optional[str]]:
    """
    Decode the JWT and fetch the row from the table named by its ``user_type``.

    Returns ``(user, user_type)``, or ``(None, None)`` when the token is absent,
    malformed, carries an unknown user_type, or names a row that no longer
    exists. No exception is raised — callers decide whether that is fatal.
    """
    if not token:
        return None, None
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id_str: Optional[str] = payload.get("sub")
        user_type: Optional[str] = payload.get("user_type")
        if user_id_str is None or user_type is None:
            return None, None
        user_id = int(user_id_str)
    except (jwt.InvalidTokenError, ValueError):
        return None, None

    model = USER_TYPE_MODELS.get(user_type)
    if model is None:
        logger.warning("Token presented an unrecognised user_type: %.20s", user_type)
        return None, None

    result = await db.execute(select(model).filter(model.id == user_id))
    user = result.scalars().first()
    if user is None:
        return None, None
    return user, user_type


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Requires a valid JWT. Returns the authenticated user row or raises 401.

    The returned object is one of AdminUser / PickerUser / SalesUser /
    DashboardUser. Its ``user_type`` is attached as a transient attribute so
    callers can branch without decoding the token again.
    """
    user, user_type = await _decode_and_fetch_user(token, db)
    if user is None:
        logger.warning("Rejected unauthenticated request — no valid JWT presented")
        raise _CREDENTIALS_EXCEPTION
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    user.user_type = user_type
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Attempts to decode the JWT. Returns the user if valid, None if absent/invalid.
    Use for endpoints accessible by both authenticated and anonymous clients.
    """
    if not token:
        return None
    user, user_type = await _decode_and_fetch_user(token, db)
    if user is None or not user.is_active:
        return None
    user.user_type = user_type
    return user


async def get_current_admin(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """
    Requires a valid JWT whose user_type is exactly 'admin'.

    The check is on the token claim, not on a role column, so a picker or sales
    token can never satisfy it regardless of what its row contains.
    """
    user, user_type = await _decode_and_fetch_user(token, db)
    if user is None:
        raise _CREDENTIALS_EXCEPTION
    if user_type != USER_TYPE_ADMIN:
        logger.warning(
            "Non-admin (%s id=%s) attempted an admin-only action", user_type, user.id
        )
        raise _FORBIDDEN_EXCEPTION
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    user.user_type = user_type
    return user


async def get_current_picker(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> PickerUser:
    """Requires a valid JWT whose user_type is exactly 'picker'."""
    user, user_type = await _decode_and_fetch_user(token, db)
    if user is None:
        raise _CREDENTIALS_EXCEPTION
    if user_type != USER_TYPE_PICKER:
        raise _FORBIDDEN_EXCEPTION
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    user.user_type = user_type
    return user


async def get_current_sales_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> SalesUser:
    """Requires a valid JWT whose user_type is exactly 'sales'."""
    user, user_type = await _decode_and_fetch_user(token, db)
    if user is None:
        raise _CREDENTIALS_EXCEPTION
    if user_type != USER_TYPE_SALES:
        raise _FORBIDDEN_EXCEPTION
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    user.user_type = user_type
    return user


async def get_current_access(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> EffectiveAccess:
    """
    Resolve the authenticated caller's portal access. Raises 401 without a token.

    Returns the access only. An endpoint that also needs the row should depend
    on :func:`require_module`, which returns the user with the resolved access
    attached rather than making it resolve twice.
    """
    user = await get_current_user(token, db)
    return access_for(user, user.user_type)


def require_module(module: PortalModule):
    """
    Build a dependency that admits only callers holding ``module``.

    The check is on the caller's RESOLVED access — role default or explicit
    grant, whichever applies — never on a role name directly. A role is an input
    to the rule, not the rule; comparing against one here would mean an explicit
    grant that widens or narrows an account had no effect on this endpoint.

    Admins pass unconditionally: they own the portal outright, which
    :data:`~backend.core.access.PORTAL_OWNER` expresses. Pickers and sales reps
    hold no portal module at all and are refused, whatever their mobile app lets
    them do.

    The returned user carries the resolved access on a transient ``access``
    attribute, so an endpoint can scope its query without resolving it again.
    """

    async def _require(
        token: Optional[str] = Depends(oauth2_scheme),
        db: AsyncSession = Depends(get_db),
    ):
        user = await get_current_user(token, db)
        access = access_for(user, user.user_type)
        if not access.has_module(module):
            logger.warning(
                "Refused a %s action: user_type=%s id=%s role=%s",
                module.value,
                user.user_type,
                user.id,
                getattr(user, "role", None),
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your account does not have access to {module.value}.",
            )
        user.access = access
        return user

    return _require
