from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.database import get_db
from backend.models.user import User
from backend.schemas.auth import Token, LoginRequest, UserOut
from backend.services.auth_service import verify_password
from backend.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import or_
    # Look up user by email or full_name (used as username)
    result = await db.execute(
        select(User).filter(
            or_(
                User.email.ilike(login_data.email.strip()),
                User.full_name.ilike(login_data.email.strip())
            )
        )
    )
    user = result.scalars().first()
    
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Simple, reliable session token based on user id and role - no complex cryptographic JWT or expiration needed
    session_token = f"nexware_session_{user.id}_{user.role}"
    
    return {
        "token": session_token,
        "access_token": session_token,  # provided as alias for client compatibility
        "token_type": "bearer",
        "user": user
    }

@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=UserOut)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
