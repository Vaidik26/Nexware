import pdfplumber
import re
from typing import Dict, Any, List

try:
    import pypdfium2 as pdfium
    _PDFIUM_AVAILABLE = True
except ImportError:
    _PDFIUM_AVAILABLE = False


def _extract_text_pypdfium(file_path: str) -> tuple[str, List[str]]:
    """
    Extract full text from a PDF using pypdfium2 (PDFium — Chrome's PDF engine).
    Returns (full_text, all_lines).
    Much better than pdfplumber at preserving text order in complex layouts.
    """
    full_text = ""
    all_lines: List[str] = []
    doc = pdfium.PdfDocument(file_path)
    for i in range(len(doc)):
        page = doc[i]
        textpage = page.get_textpage()
        page_text = textpage.get_text_range() or ""
        # pypdfium2 uses \r\n on Windows — normalise
        page_text = page_text.replace("\r\n", "\n").replace("\r", "\n")
        full_text += page_text + "\n"
        all_lines.extend(page_text.split("\n"))
    doc.close()
    return full_text, all_lines

# ---------------------------------------------------------------------------
# Exclusion keywords — footer/tax/contact lines that are NOT product rows
# ---------------------------------------------------------------------------
EXCLUDE_KEYWORDS = {
    'phone:', 'tel:', 'fax:', 'mob:', 'p.o. box', 'cr#', 'cr no', 'trn#',
    'tin#', 'iban:', 'swift:', 'email:', 'http:', 'www.',
    'subtotal', 'sub total', 'total amount', 'net total', 'special discount',
    'other charges', 'gross amount', 'taxable amount', 'tax amount', 'amount (in words)'
}

# ---------------------------------------------------------------------------
# Column header keyword sets
# ---------------------------------------------------------------------------
BARCODE_HEADERS = {
    'barcode', 'ean', 'ean code', 'ean/upc', 'upc', 'upc code',
    'item code', 'item ref', 'item ref no', 'barcode / ean',
    'barcode/ean', 'barcode/item', 'barcode / item', 'product code',
    'sku', 'code',
}
QTY_HEADERS = {
    'qty', 'quantity', 'ordered qty', 'order qty', 'qty ctn',
    'qty ordered', 'order quantity', 'pcs', 'units',
}
DESC_HEADERS = {
    'name', 'item name', 'description', 'product', 'product title',
    'item description', 'product description', 'particulars',
    'goods description', 'goods',
}
UOM_HEADERS = {'unit', 'uom', 'packing unit', 'pack unit', 'u/m'}

ALL_HEADER_KEYWORDS = (
    BARCODE_HEADERS | QTY_HEADERS | DESC_HEADERS | UOM_HEADERS | {
        'sn', 'sn.', 's.no', 'no', 'sl no', 'sr', 'sr.', 'serial',
        'pack', 'packing', 'price', 'u.price', 'unit price', 'rate', 'disc',
        'discount', 'tax', 'net amount', 'total', 'foc', 'factor', 'taxable amt',
        'amount', 'rate (omr)', 'rate(omr)',
    }
)


def _is_metadata_or_contact_line(text_line: str) -> bool:
    lower_line = text_line.lower()
    words = set(re.findall(r'\w+', lower_line))
    if 'total' in words and not any(
        w in lower_line for w in {'pack', 'oil', 'powder', 'milk', 'water', 'cream', 'juice', 'box', 'tin'}
    ):
        return True
    for kw in EXCLUDE_KEYWORDS:
        if kw in lower_line:
            return True
    return False


def _is_table_header_row(cells: List[str]) -> bool:
    non_empty = [c.lower().strip() for c in cells if c.strip()]
    if not non_empty:
        return True
    matches = sum(
        1 for c in non_empty
        if c in ALL_HEADER_KEYWORDS
        or any(hw in c for hw in {
            'barcode', 'ean code', 'item ref', 'description', 'net amount', 'u.price', 'taxable'
        })
    )
    return (matches / len(non_empty)) >= 0.4


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


# ---------------------------------------------------------------------------
# Scientific notation detection
# Scientific notation barcodes like 6.29400E+12 are IRRECOVERABLE because
# float64 has only ~15 sig-fig precision; 6.29400 has 6 → trailing digits lost.
# They must be flagged as exceptions, not silently corrupted.
# ---------------------------------------------------------------------------
_SCI_RE = re.compile(r"^['\"\s]*[\d.]+[Ee][+\-]?\d+['\"\s]*$")


def _is_scientific_notation(raw: str) -> bool:
    return bool(_SCI_RE.match(raw.strip()))


# ---------------------------------------------------------------------------
# Barcode normalisation — handles stray-space and apostrophe edge cases
# ---------------------------------------------------------------------------
def _normalize_barcode_cell(raw: str) -> str:
    """
    Extract a clean 11-15 digit barcode from a raw cell value.
    Handles:
      - Leading apostrophe / quote (Excel text-force prefix): '6294003000585
      - Stray internal spaces (copy-paste artifact):           6294003 020521
    Scientific notation is NOT handled here (see _is_scientific_notation).
    Returns the cleaned digit string, or '' if nothing valid found.
    """
    raw = raw.strip()
    if not raw or _is_scientific_notation(raw):
        return ''

    # Strip leading apostrophe / quote
    raw = raw.lstrip("'\"")

    # Collapse stray spaces between digits
    no_spaces = re.sub(r'(?<=\d)\s+(?=\d)', '', raw)

    m = re.search(r'(\d{11,15})', no_spaces)
    return m.group(1) if m else ''


# ---------------------------------------------------------------------------
# PDF2-style block reconstruction: join split barcode/continuation lines
# e.g.  "Barcode / Item 62940030172"  followed by  "Code 93"
# ---------------------------------------------------------------------------
def _reconstruct_block_barcodes(lines: List[str]) -> List[Dict[str, Any]]:
    """
    Handle block-style LPOs where the barcode is split across lines:
        Barcode / Item 62940030172
        Order Qty 120 PCS Unit Price 0.790 OMR   ← optional intervening line
        Code 93
    → full barcode = 62940030172 + 93 = 6294003017293

    The 'Code NNN' continuation may appear 1 or 2 lines after the barcode line.
    Returns list of dicts keyed with barcode, description, quantity.
    """
    items = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Line like: "Barcode / Item 62940030172"
        bc_prefix = re.match(
            r'(?:Barcode\s*/?\s*Item|Barcode|Item\s+Code|Product\s+Code)\s+(\d{5,})',
            line, re.IGNORECASE
        )
        if bc_prefix:
            partial = bc_prefix.group(1)
            cont = None
            cont_offset = 0

            # Check lines[i+1] and lines[i+2] for "Code NNNN"
            for offset in (1, 2):
                if i + offset < len(lines):
                    candidate = lines[i + offset].strip()
                    m = re.match(r'^Code\s+(\d+)\s*$', candidate, re.IGNORECASE)
                    if m:
                        cont = m
                        cont_offset = offset
                        break

            if cont:
                full_barcode = partial + cont.group(1)

                # Quantity: scan ahead for "Order Qty NNN" or similar
                qty = 1.0
                found_qty = False
                for ahead_line in lines[i + 1: i + 6]:
                    q_match = re.search(
                        r'(?:Order\s+Qty|Qty|Quantity)\s+(\d+(?:\.\d+)?)',
                        ahead_line, re.IGNORECASE
                    )
                    if q_match:
                        qty = float(q_match.group(1))
                        found_qty = True
                        break

                # Description: look back for "Item N Description text"
                desc = ''
                if i > 0:
                    prev = lines[i - 1].strip()
                    m2 = re.match(r'Item\s+\d+\s+(.+)', prev, re.IGNORECASE)
                    if m2:
                        desc = m2.group(1).strip()

                if 11 <= len(full_barcode) <= 15:
                    items.append({
                        'barcode': full_barcode,
                        'description': desc or f'Extracted SKU ({full_barcode})',
                        'uom': 'PCS',
                        'quantity': qty,
                        'has_missing_barcode': False,
                        'has_missing_quantity': not found_qty,
                    })
                i += cont_offset + 1  # skip past the Code line
                continue

        i += 1
    return items



# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------
def parse_lpo_pdf(file_path: str) -> Dict[str, Any]:
    order_number = ''
    order_date = ''
    customer_name = ''
    currency = ''
    items_map: Dict[str, Any] = {}   # keyed by barcode (or synthetic key) to deduplicate

    all_lines: List[str] = []
    full_text = ''

    # -------------------------------------------------------------------------
    # Step 1: Try pypdfium2 first — PDFium (Chrome's engine) handles complex
    # LPO layouts far better than pdfplumber's text extraction.
    # -------------------------------------------------------------------------
    if _PDFIUM_AVAILABLE:
        pdfium_text, pdfium_lines = _extract_text_pypdfium(file_path)
        if pdfium_text.strip():
            full_text = pdfium_text
            all_lines = pdfium_lines

    with pdfplumber.open(file_path) as pdf:
        # If pypdfium2 got nothing (image-based PDF), try pdfplumber text
        if not full_text.strip():
            for page in pdf.pages:
                page_text = page.extract_text() or ''
                full_text += page_text + '\n'
                all_lines.extend(page_text.split('\n'))

        # ----------------------------------------------------------------
        # Method 1 — Structured table scanning (grid / spreadsheet LPOs)
        # Always runs — pdfplumber is best at extracting grid tables even
        # when pypdfium2 is the primary text source.
        # ----------------------------------------------------------------
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                bc_col = qty_col = desc_col = uom_col = -1

                # Locate column header positions by scanning rows
                for row in table:
                    if not row:
                        continue
                    cells_lower = [str(c).lower().strip() if c is not None else '' for c in row]
                    for idx, c in enumerate(cells_lower):
                        if bc_col == -1 and c in BARCODE_HEADERS:
                            bc_col = idx
                        if qty_col == -1 and c in QTY_HEADERS:
                            qty_col = idx
                        if desc_col == -1 and c in DESC_HEADERS:
                            desc_col = idx
                        if uom_col == -1 and c in UOM_HEADERS:
                            uom_col = idx
                    if any(x != -1 for x in (bc_col, qty_col, desc_col)):
                        break

                for row in table:
                    if not row:
                        continue

                    row_str = ' '.join([str(c) for c in row if c]).strip()
                    if not row_str:
                        continue

                    cells = [str(c).strip() if c is not None else '' for c in row]

                    # Skip recognised column-header rows
                    if _is_table_header_row(cells):
                        continue

                    # ----------------------------------------------------------
                    # Extract barcode — try known column first, then scan all cells
                    # ----------------------------------------------------------
                    barcode = ''
                    barcode_idx = -1
                    is_sci = False  # flag for irrecoverable scientific-notation barcode

                    if bc_col != -1 and bc_col < len(cells):
                        raw_bc = cells[bc_col]
                        if _is_scientific_notation(raw_bc):
                            is_sci = True
                            barcode_idx = bc_col
                        else:
                            barcode = _normalize_barcode_cell(raw_bc)
                            if barcode:
                                barcode_idx = bc_col

                    if not barcode and not is_sci:
                        for idx, cell in enumerate(cells):
                            if _is_scientific_notation(cell):
                                is_sci = True
                                barcode_idx = idx
                                break
                            candidate = _normalize_barcode_cell(cell)
                            if candidate:
                                barcode = candidate
                                barcode_idx = idx
                                break

                    # ----------------------------------------------------------
                    # Scientific-notation barcode → exception row
                    # ----------------------------------------------------------
                    if is_sci and not barcode:
                        sci_desc = ''
                        if desc_col != -1 and desc_col < len(cells):
                            sci_desc = cells[desc_col].strip()
                        if not sci_desc:
                            for idx, cell in enumerate(cells):
                                if idx != barcode_idx and len(cell) > 3 and not re.match(
                                    r'^[\d.,\s\-$x]+$', cell.strip()
                                ):
                                    sci_desc = cell.strip()
                                    break

                        sci_qty = 1.0
                        if qty_col != -1 and qty_col < len(cells):
                            qv = cells[qty_col].replace(',', '').strip()
                            if re.match(r'^\d+(\.\d+)?$', qv):
                                sci_qty = _safe_float(qv)

                        missing_key = 'SCI_' + str(len(items_map)) + '_' + sci_desc[:15].replace(' ', '_')
                        items_map[missing_key] = {
                            'barcode': '',
                            'description': sci_desc or 'Item with corrupted barcode (scientific notation)',
                            'uom': 'PCS',
                            'quantity': sci_qty,
                            'has_missing_barcode': True,
                            'has_missing_quantity': False,
                            'exception_reason': 'SCIENTIFIC_NOTATION_BARCODE',
                        }
                        continue

                    # If still no barcode, check for excluded summary/metadata line
                    if not barcode and _is_metadata_or_contact_line(row_str):
                        continue

                    # ----------------------------------------------------------
                    # Extract quantity — use qty column, avoid the AMOUNT column
                    # ----------------------------------------------------------
                    qty = 1.0
                    found_valid_qty = False

                    if qty_col != -1 and qty_col < len(cells):
                        cell_val = cells[qty_col].replace(',', '').strip()
                        if re.match(r'^\d+(\.\d+)?$', cell_val):
                            val = _safe_float(cell_val)
                            if 0 < val < 100000:
                                qty = val
                                found_valid_qty = True

                    if not found_valid_qty:
                        # Scan left-to-right; skip barcode cell, desc cell, and last col (AMOUNT)
                        for idx, cell in enumerate(cells):
                            if idx in (barcode_idx, desc_col, len(cells) - 1):
                                continue
                            clean_v = cell.replace(',', '').strip()
                            if re.match(r'^\d+(\.\d+)?$', clean_v):
                                val = _safe_float(clean_v)
                                if 0 < val < 100000:
                                    qty = val
                                    found_valid_qty = True
                                    break

                    # ----------------------------------------------------------
                    # Extract description
                    # ----------------------------------------------------------
                    desc = ''
                    if desc_col != -1 and desc_col < len(cells):
                        candidate = cells[desc_col].strip()
                        if len(candidate) > 2 and not re.match(r'^[\d.,\s\-$]+$', candidate):
                            desc = candidate

                    if not desc:
                        for idx, cell in enumerate(cells):
                            if (idx != barcode_idx
                                    and len(cell) > 3
                                    and not re.match(r'^[\d.,\s\-$x]+$', cell.strip())
                                    and cell.strip() not in {'PCS', 'NOS', 'BOX', 'KG', 'EA', 'UNIT', 'PRM', 'CTN'}):
                                if len(cell) > len(desc):
                                    desc = cell.strip()

                    uom = 'PCS'
                    if uom_col != -1 and uom_col < len(cells):
                        candidate_uom = cells[uom_col].strip()
                        if candidate_uom in {'PCS', 'BOX', 'NOS', 'KG', 'PRM', 'EA', 'UNIT', 'CTN'}:
                            uom = candidate_uom

                    # ----------------------------------------------------------
                    # Store result
                    # ----------------------------------------------------------
                    if barcode and barcode not in items_map:
                        items_map[barcode] = {
                            'barcode': barcode,
                            'description': desc or f'Extracted SKU ({barcode})',
                            'uom': uom,
                            'quantity': qty,
                            'has_missing_barcode': False,
                            'has_missing_quantity': not found_valid_qty,
                        }
                    elif not barcode and desc and len(desc) > 3 and not any(
                        kw in desc.lower() for kw in EXCLUDE_KEYWORDS
                    ):
                        missing_key = 'MISSING_BC_' + str(len(items_map)) + '_' + desc[:15].replace(' ', '_')
                        items_map[missing_key] = {
                            'barcode': '',
                            'description': desc,
                            'uom': uom,
                            'quantity': qty,
                            'has_missing_barcode': True,
                            'has_missing_quantity': not found_valid_qty,
                        }

    # ------------------------------------------------------------------------
    # Method 2 — Block-style split barcode reconstruction (PDF2)
        # Must run BEFORE Method 3 so block barcodes claim their slots first
        # --------------------------------------------------------------------
    # Must run BEFORE Method 3 so block barcodes claim their slots first
    # --------------------------------------------------------------------
    for item in _reconstruct_block_barcodes(all_lines):
        bc = item['barcode']
        if bc and bc not in items_map:
            items_map[bc] = item

    # ------------------------------------------------------------------------
    # Method 3 — Line-by-line fallback for barcodes missed by other methods
    # ------------------------------------------------------------------------
    # Regex to detect block-style barcode prefix lines (handled by Method 2)
    _BLOCK_PREFIX = re.compile(
        r'(?:Barcode\s*/?\s*Item|Barcode|Item\s+Code|Product\s+Code)\s+\d',
        re.IGNORECASE
    )

    for line in all_lines:
        line = line.strip()
        if not line or _is_metadata_or_contact_line(line):
            continue

        # Skip block-style "Barcode / Item XXXXX" lines — handled by Method 2
        if _BLOCK_PREFIX.match(line):
            continue

        # Strip leading apostrophe before word-boundary regex fires
        clean_line = re.sub(r"(?<!\w)'(?=\d)", '', line)
        # Collapse stray spaces between digit groups
        compact_line = re.sub(r'(?<=\d) (?=\d)', '', clean_line)

        bc_match = re.search(r'\b(\d{11,15})\b', compact_line)
        if bc_match:
            barcode = bc_match.group(1)
            if barcode in items_map:
                continue

            nums = re.findall(r'\b(\d+(?:\.\d+)?)\b', compact_line)
            qty = 1.0
            found_valid_qty = False
            for n in reversed(nums):
                if n == barcode or len(n) >= 11:
                    continue
                val = _safe_float(n)
                if 0 < val < 100000:
                    qty = val
                    found_valid_qty = True
                    break

            clean_desc = re.sub(r'\b\d{11,15}\b', '', compact_line)
            clean_desc = re.sub(r'\b\d+(?:\.\d+)?\b', '', clean_desc).strip()
            clean_desc = re.sub(r'\s+', ' ', clean_desc)

            if clean_desc and len(clean_desc) > 2:
                items_map[barcode] = {
                    'barcode': barcode,
                    'description': clean_desc,
                    'uom': 'PCS',
                    'quantity': qty,
                    'has_missing_barcode': False,
                    'has_missing_quantity': not found_valid_qty,
                }

    # --------------------------------------------------------------------------
    # Metadata extraction
    # --------------------------------------------------------------------------
    on_match = re.search(
        r'(?:Order Number|P\.?O\.?\s*(?:No|Number)|LPO\s*(?:No|Number|Ref#?)|Ref\s*(?:No|Number))\s*[:#\-]?\s*(\S+)',
        full_text, re.IGNORECASE
    )
    order_number = on_match.group(1) if on_match else f'LPO-{len(items_map)}-SKUS'

    od_match = re.search(
        r'(?:Order Date|Issue Date|Date)\s*[:#\-]?\s*([\d\/\.\-]+)',
        full_text, re.IGNORECASE
    )
    order_date = od_match.group(1) if od_match else 'Today'

    cn_match = re.search(
        r'(?:Customer Name|Client|Buyer|Company|Ship To|Vendor)\s*[:#\-]?\s*(.+?)(?:\r|\n|$)',
        full_text, re.IGNORECASE
    )
    if cn_match:
        raw_cn = cn_match.group(1).strip()
        cleaned_cn = re.sub(
            r'\b(L\.L\.C\.?|LLC|Pvt\.?|Ltd\.?|Inc\.?|Corp\.?)\b', '', raw_cn, flags=re.IGNORECASE
        ).strip()
        cleaned_cn = re.sub(r'^[-,:;\s]+|[-,:;\s]+$', '', cleaned_cn).strip()
        customer_name = (
            cleaned_cn
            if cleaned_cn and cleaned_cn.lower() not in ('l.l.c.', 'llc')
            else 'General Order'
        )
    else:
        customer_name = 'General Order'

    curr_match = re.search(r'(?:Currency|Curr)\s*[:#\-]?\s*([A-Z]{3})', full_text, re.IGNORECASE)
    currency = curr_match.group(1).strip() if curr_match else 'OMR'

    return {
        'order_number': order_number,
        'order_date': order_date,
        'customer_name': customer_name,
        'currency': currency,
        'items': list(items_map.values()),
    }
