from pydantic import BaseModel, ConfigDict
from typing import Optional

class UserBase(BaseModel):
    email: Optional[str] = None
    full_name: str
    role: str  # 'admin' or 'picker'
    is_available: bool = True
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

class UserOut(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    token: str
    access_token: Optional[str] = None  # Alias for client flexibility
    token_type: str = "bearer"
    user: UserOut

class LoginRequest(BaseModel):
    email: str
    password: str
