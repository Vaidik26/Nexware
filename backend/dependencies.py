from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.database import get_db
from backend.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token or not token.startswith("nexware_session_"):
        raise credentials_exception

    try:
        # Format: nexware_session_<user_id>_<role>
        parts = token.split("_")
        if len(parts) < 4:
            raise credentials_exception
        user_id = int(parts[2])
    except (IndexError, ValueError):
        raise credentials_exception

    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

async def get_current_user_optional(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    if not token or not token.startswith("nexware_session_"):
        return None
    try:
        parts = token.split("_")
        if len(parts) < 4:
            return None
        user_id = int(parts[2])
    except (IndexError, ValueError):
        return None

    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if user is None or not user.is_active:
        return None
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    return current_user

async def get_current_admin(current_user: User = Depends(get_current_active_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_current_picker(current_user: User = Depends(get_current_active_user)):
    if current_user.role != "picker":
        raise HTTPException(status_code=403, detail="Picker access required")
    return current_user
