"""
FastAPI dependency functions for authentication and authorization.

All token validation is done via cryptographic JWT verification (HS256).
Plain-text session token parsing has been removed — tokens are now signed
and verified using settings.JWT_SECRET_KEY.
"""
import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.config import settings
from backend.database import get_db
from backend.models.user import User

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
) -> Optional[User]:
    """
    Decode the JWT, extract user_id, and fetch the User from the DB.
    Returns None when the token is absent or invalid (no exception raised).
    """
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id_str: Optional[str] = payload.get("sub")
        if user_id_str is None:
            return None
        user_id = int(user_id_str)
    except (jwt.InvalidTokenError, ValueError):
        return None

    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    return user


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Requires a valid JWT. Returns the authenticated User or raises 401.
    """
    user = await _decode_and_fetch_user(token, db)
    if user is None:
        logger.warning("Rejected unauthenticated request — no valid JWT presented")
        raise _CREDENTIALS_EXCEPTION
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    Attempts to decode the JWT. Returns the User if valid, None if absent/invalid.
    Use for endpoints accessible by both authenticated and anonymous clients.
    """
    if not token:
        return None
    user = await _decode_and_fetch_user(token, db)
    if user and not user.is_active:
        return None
    return user


async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Requires a valid JWT AND the user must have the 'admin' role.
    Raises 403 for non-admin authenticated users.
    """
    if current_user.role != "admin":
        logger.warning(
            "Non-admin user %s attempted admin-only action", current_user.id
        )
        raise _FORBIDDEN_EXCEPTION
    return current_user
