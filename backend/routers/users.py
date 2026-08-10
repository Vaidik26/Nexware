from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from backend.database import get_db
from backend.models.user import User
from backend.models.picklist import PickAssignment, PickList
from backend.schemas.auth import UserCreate, UserOut, UserUpdate
from backend.dependencies import get_current_admin, get_current_user
from backend.services.auth_service import hash_password

router = APIRouter(prefix="/users", tags=["users"])

@router.get("", response_model=List[UserOut])
@router.get("/", response_model=List[UserOut])
async def get_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_admin)):
    result = await db.execute(select(User).order_by(User.id))
    return result.scalars().all()

@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_admin)):
    # Check duplicate email
    if user_data.email:
        result = await db.execute(select(User).filter(User.email.ilike(user_data.email.strip())))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="User with this email already exists")

    # Check duplicate full_name (used as username in login)
    if user_data.full_name:
        result_name = await db.execute(select(User).filter(User.full_name.ilike(user_data.full_name.strip())))
        if result_name.scalars().first():
            raise HTTPException(status_code=400, detail="User with this Full Name (Username) already exists")

    new_user = User(
        email=user_data.email.strip(),
        full_name=user_data.full_name,
        role=user_data.role,
        hashed_password=hash_password(user_data.password),
        is_available=user_data.is_available,
        is_active=user_data.is_active
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, user_data: UserUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_admin)):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user_data.email and user_data.email.strip() != user.email:
        # Check duplicate email
        dup_check = await db.execute(select(User).filter(User.email.ilike(user_data.email.strip())))
        if dup_check.scalars().first():
            raise HTTPException(status_code=400, detail="User with this email already exists")
        user.email = user_data.email.strip()
        
    if user_data.full_name and user_data.full_name.strip() != user.full_name:
        # Check duplicate full_name
        dup_name_check = await db.execute(select(User).filter(User.full_name.ilike(user_data.full_name.strip())))
        if dup_name_check.scalars().first():
            raise HTTPException(status_code=400, detail="User with this Full Name (Username) already exists")
        user.full_name = user_data.full_name.strip()
        

        
    if user_data.role is not None:
        user.role = user_data.role
        
    if user_data.password:
        user.hashed_password = hash_password(user_data.password)
        
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
        
    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_admin)):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Safeguard: Prevent deleting a picker if they have ongoing/active assigned pick lists
    ongoing_assignment = await db.execute(
        select(PickAssignment)
        .join(PickList, PickAssignment.pick_list_id == PickList.id)
        .filter(
            PickAssignment.picker_id == user_id,
            PickList.status.in_(["assigned", "picking", "waiting_verification"])
        )
    )
    if ongoing_assignment.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="Cannot delete user: This picker currently has active or ongoing pick list assignments. Please reassign or finish their assigned tasks before deleting this account."
        )
        
    await db.delete(user)
    await db.commit()


@router.patch("/me/status")
async def update_my_status(
    is_available: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.is_available = is_available
    await db.commit()
    return {"message": "Status updated", "is_available": is_available}


@router.patch("/{user_id}/status")
async def update_user_status(
    user_id: int,
    is_available: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_available = is_available
    await db.commit()
    return {"message": "Status updated", "is_available": is_available}
