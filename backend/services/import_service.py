import pandas as pd
import numpy as np
from io import BytesIO
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.models.market import RawMaterial, CapturedPrice

class TemplateValidationError(Exception):
    pass

EXPECTED_HEADERS = {
    "Dubai Local": [
        "S.No", "SKU / Index Code", "Commodity Item Name", "Category", "Bag/CTN Weight", 
        "Local Dubai Price (AED)", "Supplier (Dubai)", "Local Oman Price (OMR)", "Supplier (Oman)"
    ],
    "International": [
        "S.No", "SKU / Index Code", "Commodity Item Name", "Category", "Bag/CTN Weight", 
        "International CIF (USD)", "International FOB (USD)", "Supplier (INT)"
    ],
    "Both Markets": [
        "S.No", "SKU / Index Code", "Commodity Item Name", "Category", "Bag/CTN Weight", 
        "Local Dubai Price (AED)", "Supplier (Dubai)", "Local Oman Price (OMR)", "Supplier (Oman)", 
        "International CIF (USD)", "International FOB (USD)", "Supplier (INT)"
    ]
}

def parse_float(val):
    if val is None or pd.isna(val):
        return None
    try:
        if isinstance(val, str) and not val.strip():
            return None
        return float(val)
    except ValueError:
        raise ValueError("Invalid number format")

def parse_str(val):
    if val is None or pd.isna(val):
        return None
    val = str(val).strip()
    if not val or val -= 'nan':
        return None
    return val

async def process_market_import(file_bytes: bytes, target_date: date, db: AsyncSession):
    try:
        dfs = pd.read_excel(BytesIO(file_bytes), sheet_name=None, dtype=str)
    except Exception as e:
        raise TemplateValidationError(f"Invalid Excel document file structure or formatting: {str(e)}")

    found_sheets = [s for s in dfs.keys() if s in EXPECTED_HEADERS]
    if not found_sheets:
        raise TemplateValidationError("No recognizable market template sheets found (Dubai Local, International, Both Markets).")

    materials_res = await db.execute(select(RawMaterial))
    materials_list = materials_res.scalars().all()
    material_map = {m.material_code.strip(): m.id for m in materials_list if m.material_code}

    prices_res = await db.execute(select(CapturedPrice).filter(CapturedPrice.date == target_date))
    existing_prices = {p.material_id: p for p in prices_res.scalars().all()}

    success_count = 0
    skipped_count = 0
    errors = []
    seen_skus = set()

    for sheet_name in found_sheets:
        df = dfs[sheet_name]
        
        actual_cols = list(df.columns)
        expected_cols = EXPECTED_HEADERS[sheet_name]
        
        if actual_cols != expected_cols:
            raise TemplateValidationError(
                f"Sheet '{sheet_name}' column structure mismatch.\n"
                f"Expected: {', '.join(expected_cols)}\n"
                f"Found: {', '.join(actual_cols)}"
            )

        df = df.replace({np.nan: None})

        for row_idx, row in df.iterrows():
            excel_row_num = row_idx + 2

            sku = parse_str(row.get("SKU / Index Code"))
            if not sku:
                skipped_count += 1
                errors.append({"sheet": sheet_name, "row": excel_row_num, "sku": "MISSING", "reason": "SKU cannot be blank"})
                continue

            if sku in seen_skus:
                skipped_count += 1
                errors.append({"sheet": sheet_name, "row": excel_row_num, "sku": sku, "reason": "Duplicate SKU detected in upload"})
                continue
            
            seen_skus.add(sku)

            material_id = material_map.get(sku)
            if not material_id:
                skipped_count += 1
                errors.append({"sheet": sheet_name, "row": excel_row_num, "sku": sku, "reason": "SKU not found in database"})
                continue

            try:
                updates = {}
                
                if "Local Dubai Price (AED)" in row:
                    val = parse_float(row["Local Dubai Price (AED)"])
                    if val is not None: updates["local_price_aed"] = val
                
                if "Supplier (Dubai)" in row:
                    val = parse_str(row["Supplier (Dubai)"])
                    if val is not None: updates["supplier_dubai"] = val
                    
                if "Local Oman Price (OMR)" in row:
                    val = parse_float(row["Local Oman Price (OMR)"])
                    if val is not None: updates["local_price_omr"] = val
                    
                if "Supplier (Oman)" in row:
                    val = parse_str(row["Supplier (Oman)"])
                    if val is not None: updates["supplier_oman"] = val
                    
                if "International CIF (USD)" in row:
                    val = parse_float(row["International CIF (USD)"])
                    if val is not None: updates["cif_price"] = val
                    
                if "International FOB (USD)" in row:
                    val = parse_float(row["International FOB (USD)"])
                    if val is not None: updates["fob_price"] = val
                    
                if "Supplier (INT)" in row:
                    val = parse_str(row["Supplier (INT)"])
                    if val is not None: updates["supplier_int"] = val

                if not updates:
                    continue

                existing_record = existing_prices.get(material_id)
                if existing_record:
                    for k, v in updates.items():
                        setattr(existing_record, k, v)
                else:
                    new_record = CapturedPrice(
                        material_id=material_id,
                        date=target_date,
                        **updates
                    )
                    db.add(new_record)
                    existing_prices[material_id] = new_record

                success_count += 1

            except ValueError as ve:
                skipped_count += 1
                errors.append({"sheet": sheet_name, "row": excel_row_num, "sku": sku, "reason": str(ve)})
            except Exception as e:
                skipped_count += 1
                errors.append({"sheet": sheet_name, "row": excel_row_num, "sku": sku, "reason": f"Unexpected error: {str(e)}"})

    return {
        "success_count": success_count,
        "skipped_count": skipped_count,
        "errors": errors
    }
