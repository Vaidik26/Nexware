"""
Authentication router — login, logout, current user.

Uses JWT (HS256) signed with the JWT_SECRET_KEY from settings.
No plain-text session tokens — tokens are cryptographically signed and carry an expiry.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.config import settings
from backend.database import get_db
from backend.dependencies import get_current_user
from backend.models.user import User
from backend.schemas.auth import Token, LoginRequest, UserOut
from backend.services.auth_service import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _create_access_token(user_id: int, role: str) -> str:
    """Create a signed JWT access token for the given user."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Look up user by email OR full_name (used as username for pickers)
    result = await db.execute(
        select(User).filter(
            or_(
                User.email.ilike(login_data.email.strip()),
                User.full_name.ilike(login_data.email.strip()),
            )
        )
    )
    user = result.scalars().first()

    if not user or not verify_password(login_data.password, user.hashed_password):
        logger.warning("Failed login attempt for identifier: %.50s", login_data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        logger.warning("Inactive account login attempt: user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    token = _create_access_token(user.id, user.role)
    logger.info("User logged in: user_id=%s role=%s", user.id, user.role)

    return {
        "token": token,
        "access_token": token,  # alias for frontend compatibility
        "token_type": "bearer",
        "user": user,
    }


@router.post("/logout")
async def logout():
    # JWT is stateless — client simply discards the token.
    # For server-side revocation, add token to a denylist (future enhancement).
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserOut)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
