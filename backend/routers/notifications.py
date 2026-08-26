"""
In-app notification feed for the mobile picker app.

Retained deliberately: the WebSocket channel is an unauthenticated broadcast used
to nudge connected clients to refetch, and carries no per-user history. This
router serves the Alerts screen and is the only place a device registers its
Expo push token.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.database import get_db
from backend.dependencies import get_current_picker, get_current_user
from backend.models.notification import Notification
from backend.models.users import PickerUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushTokenBody(BaseModel):
    token: str


@router.get("")
@router.get("/")
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return the signed-in picker's alert feed. Other personas have no feed."""
    if not isinstance(current_user, PickerUser):
        return []
    result = await db.execute(
        select(Notification)
        .filter(Notification.picker_id == current_user.id)
        .order_by(Notification.created_at.desc())
    )
    return result.scalars().all()


@router.post("/push-token")
async def update_push_token(
    body: PushTokenBody,
    db: AsyncSession = Depends(get_db),
    current_picker: PickerUser = Depends(get_current_picker),
):
    current_picker.push_token = body.token
    await db.commit()
    return {"message": "Push token updated"}


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_picker: PickerUser = Depends(get_current_picker),
):
    result = await db.execute(
        select(Notification).filter(
            Notification.id == notification_id,
            Notification.picker_id == current_picker.id,
        )
    )
    notification = result.scalars().first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    await db.commit()
    return {"message": "Notification marked as read"}
