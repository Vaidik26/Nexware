import asyncio
import sys
import os

# Add root directory to sys path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from backend.models.catalogue import SalesItem, CartonType
from backend.models.picklist import PickList, PickListItem, PickAssignment
from backend.models.user import User
from backend.config import settings

async def seed_dummy_data():
    print("Seeding dummy data for NexWare...")
    
    db_url = settings.get_async_database_url()
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Seed Carton Types
        print("Seeding Carton Types...")
        cartons = [
            CartonType(name="Small Box (30x30x30)", tare_weight=0.5),
            CartonType(name="Medium Box (50x50x50)", tare_weight=1.2),
            CartonType(name="Large Box (80x80x80)", tare_weight=2.5)
        ]
        
        for carton in cartons:
            res = await db.execute(select(CartonType).filter(CartonType.name == carton.name))
            if not res.scalars().first():
                db.add(carton)
        await db.commit()

        # 2. Seed Sales Items
        print("Seeding Sales Items...")
        items = [
            SalesItem(item_number="ITM-001", item_name="Wireless Mouse", barcode="1001", unit="PCS", bin_location="A1-B2-C1", standard_carton_quantity=20, packaging_weight=0.2, sku_size_category="<=100g"),
            SalesItem(item_number="ITM-002", item_name="Mechanical Keyboard", barcode="1002", unit="PCS", bin_location="A1-B2-C2", standard_carton_quantity=10, packaging_weight=1.0, sku_size_category=">100g"),
            SalesItem(item_number="ITM-003", item_name="USB-C Hub", barcode="1003", unit="PCS", bin_location="A2-B1-C1", standard_carton_quantity=50, packaging_weight=0.15, sku_size_category="<=100g"),
            SalesItem(item_number="ITM-004", item_name="27-inch Monitor", barcode="1004", unit="PCS", bin_location="A3-B4-C1", standard_carton_quantity=1, packaging_weight=5.5, sku_size_category=">100g")
        ]
        
        for item in items:
            res = await db.execute(select(SalesItem).filter(SalesItem.barcode == item.barcode))
            if not res.scalars().first():
                db.add(item)
        await db.commit()

        # 3. Create a Dummy Picklist assigned to picker
        print("Creating dummy Picklist...")
        # Get picker user
        res_picker = await db.execute(select(User).filter(User.role == "picker"))
        picker = res_picker.scalars().first()
        
        if picker:
            # Check if there is already a dummy picklist
            res_pl = await db.execute(select(PickList).filter(PickList.order_number == "ORD-DUMMY-1"))
            existing_pl = res_pl.scalars().first()
            if not existing_pl:
                pl = PickList(
                    order_number="ORD-DUMMY-1",
                    customer_name="Tech Solutions Inc.",
                    status="assigned"
                )
                db.add(pl)
                await db.flush() # get pl.id
                
                assignment = PickAssignment(
                    pick_list_id=pl.id,
                    picker_id=picker.id
                )
                db.add(assignment)
                
                pl_items = [
                    PickListItem(pick_list_id=pl.id, barcode="1001", product_name="Wireless Mouse", quantity=5, unit="PCS", is_full_carton=False),
                    PickListItem(pick_list_id=pl.id, barcode="1002", product_name="Mechanical Keyboard", quantity=2, unit="PCS", is_full_carton=False),
                    PickListItem(pick_list_id=pl.id, barcode="1004", product_name="27-inch Monitor", quantity=1, unit="PCS", is_full_carton=True)
                ]
                db.add_all(pl_items)
                await db.commit()
                print(f"Created Picklist PL-{pl.id} assigned to {picker.email}")
            else:
                print("Dummy Picklist already exists.")
        else:
            print("No picker user found. Skipping picklist creation.")

    print("Data seeded successfully!")
    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32' and sys.version_info >= (3, 8):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_dummy_data())
