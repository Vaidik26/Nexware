"""
In-app notification feed.

Lives in its own module now that ``models.user`` is gone. Every notification
written by the picking and LPO flows targets a picker (the mobile Alerts
screen is the only reader), so the recipient is a strict FK to ``picker_users``
rather than the old untyped ``user_id`` integer.

This is separate from the WebSocket channel in ``backend.ws_manager``, which is
an unauthenticated broadcast used to nudge connected clients to refetch. It
carries no per-user state and does not replace this table.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from backend.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    picker_id = Column(
        Integer,
        ForeignKey("picker_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(String, nullable=True)
    title = Column(String, nullable=True)
    message = Column(String, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    picker = relationship("PickerUser", lazy="joined")
