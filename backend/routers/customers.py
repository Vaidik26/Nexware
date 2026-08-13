import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.database import get_db
from backend.dependencies import get_current_admin, get_current_user
from backend.models.customer import Customer
from backend.models.user import User
from backend.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["customers"])

@router.get("", response_model=List[CustomerOut])
@router.get("/", response_model=List[CustomerOut])
async def get_customers(
    q: str | None = Query(None, description="Search by name or code"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Customer).order_by(Customer.name.asc())
    if q:
        search = f"%{q}%"
        stmt = stmt.filter(
            (Customer.name.ilike(search)) | (Customer.customer_code.ilike(search))
        )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("", response_model=CustomerOut)
@router.post("/", response_model=CustomerOut)
async def create_customer(
    customer: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    exists = await db.execute(select(Customer).filter(Customer.customer_code == customer.customer_code))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Customer code already exists")
    
    db_customer = Customer(**customer.model_dump())
    db.add(db_customer)
    await db.commit()
    await db.refresh(db_customer)
    logger.info("Customer %s created by admin %s", db_customer.customer_code, current_user.id)
    return db_customer

@router.put("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: int,
    customer: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Customer).filter(Customer.id == customer_id))
    db_customer = result.scalar_one_or_none()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    if customer.customer_code and customer.customer_code != db_customer.customer_code:
        exists = await db.execute(select(Customer).filter(Customer.customer_code == customer.customer_code))
        if exists.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Customer code already exists")
            
    for key, value in customer.model_dump(exclude_unset=True).items():
        setattr(db_customer, key, value)
        
    await db.commit()
    await db.refresh(db_customer)
    return db_customer

@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Customer).filter(Customer.id == customer_id))
    db_customer = result.scalar_one_or_none()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    await db.delete(db_customer)
    await db.commit()
    logger.info("Customer %s deleted by admin %s", customer_id, current_user.id)
    return {"message": "Customer deleted successfully"}
