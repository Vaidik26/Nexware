from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False) # 'admin' or 'picker'
    hashed_password = Column(String, nullable=True)
    picker_pin_hash = Column(String, nullable=True)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    push_token = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    type = Column(String)
    title = Column(String)
    message = Column(String)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
