from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from backend.database import get_db
from backend.models.user import Notification, User
from backend.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("")
@router.get("/")
async def get_notifications(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()))
    return result.scalars().all()

@router.post("/push-token")
async def update_push_token(token: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.push_token = token
    await db.commit()
    return {"message": "Push token updated"}
