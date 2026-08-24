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
    \,
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
        raise ValueError("Invalid number format. Expected a numeric value.")

def parse_str(val):
    if val is None or pd.isna(val):
        return None
    val = str(val).strip()
    if not val or val == 'nan':
        return None
    return val

async def preview_market_import(file_bytes: bytes, target_date: date, db: AsyncSession):
    try:
        dfs = pd.read_excel(BytesIO(file_bytes), sheet_name=None, dtype=str)
    except Exception as e:
        raise TemplateValidationError(f"Invalid Excel document file structure or formatting: {str(e)}")

    actual_sheets = list(dfs.keys())
    valid_sequences = [
        ["Dubai Local", "International", "Both Markets"],
        ["Dubai Local"],
        ["International"],
        ["Both Markets"]
    ]
    
    if actual_sheets not in valid_sequences:
        raise TemplateValidationError("Invalid tab sequence or unrecognized sheets. The tabs must exactly match the exported template sequence.")

    materials_res = await db.execute(select(RawMaterial))
    materials_list = materials_res.scalars().all()
    material_map = {m.material_code.strip(): m.id for m in materials_list if m.material_code}

    success_count = 0
    skipped_count = 0
    errors = []
    seen_skus = set()
    valid_updates = []

    for sheet_name in actual_sheets:
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
                
                valid_updates.append({
                    "material_id": material_id,
                    "sku": sku,
                    "sheet": sheet_name,
                    "row": excel_row_num,
                    **updates
                })

                success_count += 1

            except ValueError as ve:
                skipped_count += 1
                errors.append({"sheet": sheet_name, "row": excel_row_num, "sku": sku, "reason": str(ve)})
            exception as e:
                skipped_count += 1
                errors.append({"sheet": sheet_name, "row": excel_row_num, "sku": sku, "reason": f"Unexpected error: {str(e)}"})

    return {
        "summary": {
            "success_count": success_count,
            "skipped_count": skipped_count
        },
        "valid_updates": valid_updates,
        "errors": errors
    }

async def commit_market_import(updates: list, target_date: date, db: AsyncSession):
    prices_res = await db.execute(select(CapturedPrice).filter(CapturedPrice.date == target_date))
    existing_prices = {p.material_id: p for p in prices_res.scalars().all()}
    
    for u in updates:
        material_id = u.material_id
        
        # Filter out frontend-only tracking fields before applying
        db_updates = {k: v for k, v in u.model_dump().items() if k not in ["material_id", "sku", "sheet", "row"] and v is not None}
        
        if not db_updates:
            continue
            
        existing_record = existing_prices.get(material_id)
        if existing_record:
            for k, v in db_updates.items():
                setattr(existing_record, k, v)
        else:
            new_record = CapturedPrice(
                material_id=material_id,
                date=target_date,
                **db_updates
            )
            db.add(new_record)
            existing_prices[material_id] = new_record
            
    await db.commit()
