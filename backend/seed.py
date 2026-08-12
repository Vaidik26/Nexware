import asyncio
import logging
import sys
import os
import uuid
import getpass

# Add root directory to sys path so imports function directly inside backend/
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from backend.core.logging_config import configure_logging
from backend.models import Base
from backend.models.user import User
from backend.config import settings
from backend.services.auth_service import hash_password

configure_logging()
logger = logging.getLogger(__name__)


async def seed_db():
    print("==================================================")
    print(" NexWare Super Admin Interactive Setup")
    print("==================================================")

    try:
        db_url = settings.get_async_database_url()
    except ValueError as e:
        logger.error("[Configuration Error]: %s", e)
        return

    engine = create_async_engine(
        db_url,
        echo=False,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda *_: f"__asyncpg_{uuid.uuid4().hex}__",
        },
    )

    logger.info("Verifying and creating table schema if not already present...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables confirmed/created successfully.")
    except Exception as err:
        logger.error("[Database Connection Error]: Could not connect: %s", err)
        return

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("\n--- 1. Super Admin Setup ---")
        print("Please enter credentials for your enterprise Admin Account:")

        admin_email = input("Enter Super Admin Email/Username [default: admin@nexware.com]: ").strip()
        if not admin_email:
            admin_email = "admin@nexware.com"

        admin_name = input("Enter Full Name [default: Super Admin]: ").strip()
        if not admin_name:
            admin_name = "Super Admin"

        while True:
            try:
                admin_password = getpass.getpass("Enter Super Admin Password: ").strip()
                if not admin_password:
                    print("❌ Password cannot be empty. Please try again.")
                    continue
                confirm_password = getpass.getpass("Confirm Super Admin Password: ").strip()
                if admin_password != confirm_password:
                    print("❌ Passwords do not match! Please try again.\n")
                    continue
                break
            except Exception:
                admin_password = input("Enter Super Admin Password: ").strip()
                if not admin_password:
                    print("❌ Password cannot be empty.")
                    continue
                break

        # Check if admin already exists
        res_admin = await db.execute(select(User).filter(User.email.ilike(admin_email)))
        existing_admin = res_admin.scalars().first()

        if existing_admin:
            print(f"\n⚠️ Account '{admin_email}' already exists in Supabase!")
            choice = input(f"Do you want to reset/update the password and permissions for '{admin_email}'? (y/N): ").strip().lower()
            if choice == 'y':
                existing_admin.full_name = admin_name
                existing_admin.hashed_password = hash_password(admin_password)
                existing_admin.role = "admin"
                existing_admin.is_active = True
                existing_admin.is_available = True
                await db.commit()
                print(f"\n✅ Successfully updated Super Admin account: '{admin_email}'!")
            else:
                print("\n🚫 Operation cancelled for admin account.")
        else:
            new_admin = User(
                email=admin_email,
                full_name=admin_name,
                role="admin",
                hashed_password=hash_password(admin_password),
                is_active=True,
                is_available=True
            )
            db.add(new_admin)
            await db.commit()
            print(f"\n✅ Successfully created brand new Super Admin: '{admin_email}'!")

        # Picker Setup for Mobile Evaluation
        print("\n--- 2. Warehouse Picker Setup (Mobile App Evaluation) ---")
        picker_choice = input("Would you like to configure/seed a Warehouse Picker account for mobile app testing? (Y/n): ").strip().lower()
        if picker_choice in ('', 'y', 'yes'):
            picker_email = input("Enter Picker Email/Username [default: picker@nexware.com]: ").strip()
            if not picker_email:
                picker_email = "picker@nexware.com"

            picker_name = input("Enter Picker Name [default: John Picker]: ").strip()
            if not picker_name:
                picker_name = "John Picker"

            while True:
                try:
                    picker_password = getpass.getpass("Enter Picker Password/PIN: ").strip()
                    if not picker_password:
                        print("❌ Password cannot be empty.")
                        continue
                    break
                except Exception:
                    picker_password = input("Enter Picker Password/PIN: ").strip()
                    if not picker_password:
                        print("❌ Password cannot be empty.")
                        continue
                    break

            res_picker = await db.execute(select(User).filter(User.email.ilike(picker_email)))
            existing_picker = res_picker.scalars().first()

            if existing_picker:
                print(f"\n⚠️ Picker '{picker_email}' already exists in database!")
                p_update = input("Update password and status for this picker? (y/N): ").strip().lower()
                if p_update == 'y':
                    existing_picker.full_name = picker_name
                    existing_picker.hashed_password = hash_password(picker_password)
                    existing_picker.role = "picker"
                    existing_picker.is_active = True
                    existing_picker.is_available = True
                    await db.commit()
                    print(f"✅ Successfully updated Picker account: '{picker_email}'!")
                else:
                    print("🚫 No changes made to picker account.")
            else:
                new_picker = User(
                    email=picker_email,
                    full_name=picker_name,
                    role="picker",
                    hashed_password=hash_password(picker_password),
                    is_active=True,
                    is_available=True
                )
                db.add(new_picker)
                await db.commit()
                logger.info(f"✅ Successfully created brand new Picker account: '{picker_email}'!")

    await engine.dispose()
    logger.info("Setup complete.")


if __name__ == "__main__":
    if sys.platform == 'win32' and sys.version_info >= (3, 8):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_db())
