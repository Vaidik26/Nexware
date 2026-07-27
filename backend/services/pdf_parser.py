import pdfplumber
import re
from typing import Dict, Any, List

# Keywords that indicate an administrative, contact, financial, or tax footer line (NOT a product item row!)
EXCLUDE_KEYWORDS = {
    'phone:', 'tel:', 'fax:', 'mob:', 'p.o. box', 'cr#', 'cr no', 'trn#', 
    'tin#', 'iban:', 'swift:', 'email:', 'http:', 'www.',
    'subtotal', 'sub total', 'total amount', 'net total', 'special discount', 
    'other charges', 'gross amount', 'taxable amount', 'tax amount', 'amount (in words)'
}

def _is_metadata_or_contact_line(text_line: str) -> bool:
    """Check if the text row/line belongs to header, contact info, or tax IDs instead of product items."""
    lower_line = text_line.lower()
    words = set(re.findall(r'\w+', lower_line))
    if 'total' in words and not any(w in lower_line for w in {'pack', 'oil', 'powder', 'milk', 'water', 'cream', 'juice', 'box', 'tin'}):
        return True
    for kw in EXCLUDE_KEYWORDS:
        if kw in lower_line:
            return True
    return False

TABLE_HEADERS = {'sn', 'sn.', 's.no', 'no', 'sl no', 'barcode', 'item ref', 'item ref no', 'name', 'item name', 'description', 'unit', 'uom', 'packing', 'qty', 'quantity', 'price', 'u.price', 'rate', 'disc', 'discount', 'tax', 'net amount', 'total', 'foc', 'factor', 'taxable amt'}

def _is_table_header_row(cells: List[str]) -> bool:
    non_empty = [c.lower().strip() for c in cells if c.strip()]
    if not non_empty:
        return True
    header_matches = sum(1 for c in non_empty if c in TABLE_HEADERS or any(hw in c for hw in {'barcode', 'item ref', 'description', 'net amount', 'u.price', 'taxable'}))
    return (header_matches / len(non_empty)) >= 0.4


def _safe_float(val: str, default: float = 1.0) -> float:
    try:
        clean = re.sub(r'[^\d.]', '', val.strip())
        if clean and '.' in clean:
            return float(clean)
        elif clean:
            return float(int(clean))
        return default
    except Exception:
        return default

def parse_lpo_pdf(file_path: str) -> Dict[str, Any]:
    order_number = ""
    order_date = ""
    customer_name = ""
    currency = ""
    items_map = {} # Map by barcode to prevent duplicates

    with pdfplumber.open(file_path) as pdf:
        full_text = ""
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"
            
            # Method 1: Strict Table Scanning for EAN/UPC Product Barcodes & Edge Cases
            tables = page.extract_tables()
            for table in tables:
                bc_col = -1
                qty_col = -1
                desc_col = -1
                uom_col = -1

                # Locate column headers if present in table
                for row in table:
                    if not row:
                        continue
                    cells_lower = [str(c).lower().strip() if c is not None else "" for c in row]
                    for idx, c in enumerate(cells_lower):
                        if c in {'barcode', 'item code', 'upc', 'ean'}:
                            bc_col = idx
                        elif c in {'qty', 'quantity', 'ordered qty', 'order qty'}:
                            qty_col = idx
                        elif c in {'name', 'item name', 'description', 'product', 'product title', 'item description'}:
                            desc_col = idx
                        elif c in {'unit', 'uom', 'packing unit'}:
                            uom_col = idx
                    if any(x != -1 for x in (bc_col, qty_col, desc_col)):
                        break

                for row in table:
                    if not row:
                        continue
                    
                    row_str = " ".join([str(c) for c in row if c]).strip()
                    if not row_str:
                        continue
                    
                    cells = [str(c).strip() if c is not None else "" for c in row]
                    if _is_table_header_row(cells):
                        continue
                    
                    barcode = None
                    barcode_idx = -1
                    if bc_col != -1 and bc_col < len(cells):
                        match = re.search(r'\b(\d{11,15})\b', cells[bc_col])
                        if match:
                            barcode = match.group(1)
                            barcode_idx = bc_col
                    if not barcode:
                        for idx, cell in enumerate(cells):
                            match = re.search(r'\b(\d{11,15})\b', cell)
                            if match:
                                barcode = match.group(1)
                                barcode_idx = idx
                                break
                    
                    # If no barcode found, check if it's an excluded summary/metadata line
                    if not barcode and _is_metadata_or_contact_line(row_str):
                        continue

                    # Determine quantity
                    qty = 1.0
                    found_valid_qty = False
                    if qty_col != -1 and qty_col < len(cells) and cells[qty_col].replace('.', '').replace(',', '').strip().isdigit():
                        val = _safe_float(cells[qty_col])
                        if val > 0 and val < 100000:
                            qty = val
                            found_valid_qty = True
                    if not found_valid_qty:
                        for cell in reversed(cells):
                            if cell and re.match(r'^\d+(\.\d+)?$', cell.replace(',', '').strip()):
                                val = _safe_float(cell)
                                if str(int(val)) != barcode and val > 0 and val < 100000:
                                    qty = val
                                    found_valid_qty = True
                                    break
                    
                    # Determine description
                    desc = ""
                    if desc_col != -1 and desc_col < len(cells) and len(cells[desc_col].strip()) > 2 and not re.match(r'^[\d.,\s\-$₹€£%]+$', cells[desc_col].strip()):
                        desc = cells[desc_col].strip()
                    if not desc:
                        for idx, cell in enumerate(cells):
                            if idx != barcode_idx and len(cell) > 3 and not re.match(r'^[\d.,\s\-$₹€£%]+$', cell.strip()) and cell.strip() not in {"PCS", "NOS", "BOX", "KG", "EA", "UNIT", "PRM"}:
                                if len(cell) > len(desc):
                                    desc = cell.strip()
                    
                    uom = "PCS"
                    if uom_col != -1 and uom_col < len(cells) and cells[uom_col].strip() in {"PCS", "BOX", "NOS", "KG", "PRM", "EA", "UNIT"}:
                        uom = cells[uom_col].strip()

                    if barcode and barcode not in items_map:
                        items_map[barcode] = {
                            "barcode": barcode,
                            "description": desc or f"Extracted SKU ({barcode})",
                            "uom": uom,
                            "quantity": qty,
                            "has_missing_barcode": False,
                            "has_missing_quantity": not found_valid_qty
                        }
                    elif not barcode and desc and len(desc) > 3 and not any(kw in desc.lower() for kw in EXCLUDE_KEYWORDS):
                        missing_key = f"MISSING_BC_{len(items_map)}_{desc[:15].replace(' ', '_')}"
                        items_map[missing_key] = {
                            "barcode": "",
                            "description": desc,
                            "uom": uom,
                            "quantity": qty,
                            "has_missing_barcode": True,
                            "has_missing_quantity": not found_valid_qty
                        }

        # Method 2: Line-by-line fallback scanning strictly for 11-15 digit product barcodes
        for line in full_text.split('\n'):
            line = line.strip()
            if not line or _is_metadata_or_contact_line(line):
                continue
            
            # Match strictly 11 to 15 continuous digits (ignores 8-10 digit telephone and CR numbers!)
            bc_match = re.search(r'\b(\d{11,15})\b', line)
            if bc_match:
                barcode = bc_match.group(1)
                if barcode not in items_map:
                    nums = re.findall(r'\b(\d+(\.\d+)?)\b', line)
                    qty = 1.0
                    found_valid_qty = False
                    if nums and nums[-1][0] != barcode:
                        val = _safe_float(nums[-1][0])
                        if val > 0 and val < 100000: # Exclude accidental large registration ID numbers
                            qty = val
                            found_valid_qty = True
                    
                    clean_desc = re.sub(r'\b\d{11,15}\b', '', line)
                    clean_desc = re.sub(r'\b\d+(\.\d+)?\b', '', clean_desc).strip()
                    clean_desc = re.sub(r'\s+', ' ', clean_desc)
                    
                    if clean_desc and len(clean_desc) > 2:
                        items_map[barcode] = {
                            "barcode": barcode,
                            "description": clean_desc,
                            "uom": "PCS",
                            "quantity": qty,
                            "has_missing_barcode": False,
                            "has_missing_quantity": not found_valid_qty
                        }

    # Metadata extraction
    on_match = re.search(r'(?:Order Number|P\.?O\.?\s*(?:No|Number)|LPO\s*(?:No|Number)|Ref\s*(?:No|Number))\s*[:#-]?\s*(\S+)', full_text, re.IGNORECASE)
    if on_match:
        order_number = on_match.group(1)
    else:
        order_number = f"LPO-{len(items_map)}-SKUS"

    od_match = re.search(r'(?:Order Date|Date)\s*[:#-]?\s*([\d\/\.\-]+)', full_text, re.IGNORECASE)
    if od_match:
        order_date = od_match.group(1)
    else:
        order_date = "Today"
        
    cn_match = re.search(r'(?:Customer Name|Client|Buyer|Company)\s*[:#-]?\s*(.+?)(?:\r|\n|$)', full_text, re.IGNORECASE)
    if cn_match:
        raw_cn = cn_match.group(1).strip()
        cleaned_cn = re.sub(r'\b(L\.L\.C\.?|LLC|Pvt\.?|Ltd\.?|Inc\.?|Corp\.?)\b', '', raw_cn, flags=re.IGNORECASE).strip()
        cleaned_cn = re.sub(r'^[-,:;\s]+|[-,:;\s]+$', '', cleaned_cn).strip()
        customer_name = cleaned_cn if cleaned_cn and cleaned_cn.lower() not in ("l.l.c.", "llc", "enterprise partner co.") else "General Order"
    else:
        customer_name = "General Order"
        
    curr_match = re.search(r'(?:Currency|Curr)\s*[:#-]?\s*([A-Z]{3})', full_text, re.IGNORECASE)
    if curr_match:
        currency = curr_match.group(1).strip()
    else:
        currency = "OMR"

    return {
        "order_number": order_number,
        "order_date": order_date,
        "customer_name": customer_name,
        "currency": currency,
        "items": list(items_map.values())
    }
