"""
seed_from_lpos.py
=================
One-time seeding script: scans every PDF in the LPO Pick list folder,
parses items using the existing pdf_parser engine, and bulk-inserts any
NEW items into the `sales_items` database table.

Run:
    python -m backend.seed_from_lpos

All items are upserted -- existing barcodes are skipped (no overwrite).
"""

import asyncio
import os
import re
import sys
from pathlib import Path

# allow running as: python -m backend.seed_from_lpos
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.models.catalogue import SalesItem
from backend.services.pdf_parser import parse_lpo_pdf

# LPO folder path
LPO_FOLDER = Path(__file__).resolve().parents[1] / (
    "InternalDevelopments/InternalDevelopments/LPO Pick list"
)

DATABASE_URL = os.environ["DATABASE_URL"]
# Convert sync postgres URL -> async asyncpg URL
ASYNC_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(ASYNC_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _generate_item_number(barcode: str, index: int) -> str:
    """Generate a deterministic item number from the barcode."""
    if barcode:
        return f"BC-{barcode}"
    return f"ITEM-{index:05d}"


def _clean_description(desc: str) -> str:
    """Clean up extracted description text."""
    desc = re.sub(r"\s+", " ", desc).strip()
    desc = re.sub(r"^[\-:,./\\]+|[\-:,./\\]+$", "", desc).strip()
    return desc or "Unknown Item"


async def seed():
    print(f"\nScanning: {LPO_FOLDER}\n")

    pdf_files = list(LPO_FOLDER.glob("*.pdf")) + list(LPO_FOLDER.glob("*.PDF"))
    if not pdf_files:
        print("No PDF files found in the LPO folder.")
        return

    all_items = {}

    for pdf_path in pdf_files:
        print(f"Parsing: {pdf_path.name} ...", end=" ", flush=True)
        try:
            result = parse_lpo_pdf(str(pdf_path))
            items = result.get("items", [])
            if not items:
                print("No items extracted (may be scanned/image-based PDF)")
                continue

            new_from_file = 0
            for item in items:
                barcode = item.get("barcode", "").strip()
                desc = _clean_description(item.get("description", ""))
                uom = item.get("uom", "PCS").strip() or "PCS"

                if not barcode and not desc:
                    continue

                key = barcode if barcode else f"NODESC_{desc[:30]}"
                if key not in all_items:
                    all_items[key] = {
                        "barcode": barcode,
                        "description": desc,
                        "uom": uom,
                        "has_missing_barcode": item.get("has_missing_barcode", False),
                    }
                    new_from_file += 1

            print(f"{new_from_file} new items")
        except Exception as e:
            print(f"Error: {e}")

    if not all_items:
        print("\nNo items parsed from any LPO. Nothing to seed.")
        return

    print(f"\nTotal unique items found across all LPOs: {len(all_items)}")

    async with AsyncSessionLocal() as session:
        existing_barcodes_res = await session.execute(select(SalesItem.barcode))
        existing_barcodes = {row[0] for row in existing_barcodes_res.fetchall() if row[0]}

        existing_item_numbers_res = await session.execute(select(SalesItem.item_number))
        existing_item_numbers = {row[0] for row in existing_item_numbers_res.fetchall() if row[0]}

        to_insert = []
        skipped = 0
        index = len(existing_item_numbers) + 1

        for key, item in all_items.items():
            barcode = item["barcode"]
            desc = item["description"]
            uom = item["uom"]

            if barcode and barcode in existing_barcodes:
                skipped += 1
                continue

            item_number = _generate_item_number(barcode, index)
            while item_number in existing_item_numbers:
                index += 1
                item_number = _generate_item_number(barcode, index)

            to_insert.append({
                "item_number": item_number,
                "item_name": desc,
                "barcode": barcode if barcode else f"GEN-{item_number}",
                "unit": uom,
                "bin_location": None,
                "standard_carton_quantity": 1,
                "packaging_weight": 0.0,
                "sku_size_category": ">100g",
                "available_quantity": 0,
            })

            existing_barcodes.add(barcode)
            existing_item_numbers.add(item_number)
            index += 1

        if not to_insert:
            print(f"\nAll {skipped} items already exist in the database. Nothing new to insert.")
            return

        print(f"\nInserting {len(to_insert)} new items (skipping {skipped} duplicates)...")

        CHUNK_SIZE = 100
        inserted_total = 0
        for i in range(0, len(to_insert), CHUNK_SIZE):
            chunk = to_insert[i:i + CHUNK_SIZE]
            try:
                stmt = pg_insert(SalesItem).values(chunk).on_conflict_do_nothing(
                    index_elements=["barcode"]
                )
                await session.execute(stmt)
                await session.commit()
                inserted_total += len(chunk)
                print(f"  Inserted chunk {i // CHUNK_SIZE + 1} ({len(chunk)} items)")
            except Exception as e:
                await session.rollback()
                print(f"  Chunk failed: {e}")

        print(f"\nDone! Inserted {inserted_total} new items into sales_items table.")

        print("\nSample of inserted items:")
        for item in to_insert[:10]:
            print(f"  [{item['item_number']}] {item['item_name'][:50]} | Barcode: {item['barcode']} | Unit: {item['unit']}")
        if len(to_insert) > 10:
            print(f"  ... and {len(to_insert) - 10} more")


if __name__ == "__main__":
    asyncio.run(seed())
