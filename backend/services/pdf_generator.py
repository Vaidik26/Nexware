from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.lib import colors
import io
from datetime import datetime

def generate_picklist_pdf(picklist_data, items_data=None):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Header without Order Reference or Partner Customer details
    elements.append(Paragraph("<b>NEXWARE WAREHOUSE FLOOR PICK LIST</b>", styles['Title']))
    elements.append(Spacer(1, 15))
    
    pl_status = getattr(picklist_data, 'status', '') if not isinstance(picklist_data, dict) else picklist_data.get('status', '')

    # Support both ORM models and dictionaries
    if items_data is None and hasattr(picklist_data, 'items'):
        raw_items = picklist_data.items
        items_list = [
            {
                "barcode": getattr(i, "barcode", ""),
                "product_name": getattr(i, "product_name", ""),
                "unit": getattr(i, "unit", "PCS"),
                "quantity": getattr(i, "quantity", 1),
                "is_picked": getattr(i, "is_picked", False),
            }
            for i in raw_items
        ]
    else:
        items_list = items_data or []
        
    items_list = [i for i in items_list if i.get("barcode") and i.get("barcode") not in ("NO-BARCODE-IN-LPO", "N/A", "EXCEPTION-BC", "EXCEPTION-CAT")]
    if not items_list:
        raise ValueError("Cannot generate PDF picklist: No verified catalogue SKUs available in this order.")
        
    # Define styles for cells to enable clean auto-wrapping of long product names
    cell_center = ParagraphStyle('CellCenter', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=12, alignment=TA_CENTER)
    cell_left_bold = ParagraphStyle('CellLeftBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=12, alignment=TA_LEFT)
    cell_barcode = ParagraphStyle('CellBarcode', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=12, alignment=TA_CENTER)
    header_style = ParagraphStyle('HeaderStyle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=colors.white, alignment=TA_CENTER)
    header_left = ParagraphStyle('HeaderLeft', parent=header_style, alignment=TA_LEFT)

    # Table Data with wrapped paragraphs
    data = [[
        Paragraph('<b>SI</b>', header_style),
        Paragraph('<b>Item Code (Barcode)</b>', header_style),
        Paragraph('<b>Description / Product Title</b>', header_left),
        Paragraph('<b>Quantity</b>', header_style),
        Paragraph('<b>Checked</b>', header_style),
        Paragraph('<b>Picked</b>', header_style)
    ]]
    
    tick_html = '<b>[</b> <font name="ZapfDingbats" color="#154c34" size="10">4</font> <b>]</b>'
    empty_html = '[ &nbsp; ]'

    for idx, item in enumerate(items_list):
        qty_val = item.get('quantity', 1)
        unit_val = item.get('unit', 'PCS')

        is_picked_row = pl_status in ("waiting_verification", "picked", "verified", "completed") or item.get("is_picked", False)
        is_checked_row = pl_status in ("verified", "completed")

        picked_cell = tick_html if is_picked_row else empty_html
        checked_cell = tick_html if is_checked_row else empty_html

        data.append([
            Paragraph(str(idx + 1), cell_center),
            Paragraph(str(item.get('barcode', '')), cell_barcode),
            Paragraph(str(item.get('product_name', '')), cell_left_bold),
            Paragraph(f"<b>{qty_val}</b> {unit_val}", cell_center),
            Paragraph(checked_cell, cell_center),
            Paragraph(picked_cell, cell_center)
        ])
        
    t = Table(data, colWidths=[28, 97, 280, 45, 45, 45])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#154c34')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('ALIGN', (2,0), (2,-1), 'LEFT'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 1, colors.HexColor('#cccccc'))
    ]))
    
    elements.append(t)
    # No footer signature lines (Prepared by / Picked by / Verified by completely removed!)
    
    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def generate_price_history_pdf(payload: dict) -> bytes:
    buffer = io.BytesIO()
    # Using letter with 36 pt (0.5 in) margins giving 540 pt usable width
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    elements = []
    styles = getSampleStyleSheet()

    # Define custom clean typography styles
    title_style = ParagraphStyle(
        'NexWareTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#154c34'),
        alignment=TA_LEFT
    )
    sub_style = ParagraphStyle(
        'NexWareSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
        alignment=TA_LEFT
    )
    date_header_style = ParagraphStyle(
        'DateHeaderStyle',
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.white,
        alignment=TA_LEFT
    )
    cell_left = ParagraphStyle('CellLeft', fontName='Helvetica', fontSize=9, leading=12, alignment=TA_LEFT)
    cell_left_bold = ParagraphStyle('CellLeftBold', fontName='Helvetica-Bold', fontSize=9, leading=12, alignment=TA_LEFT)
    cell_center = ParagraphStyle('CellCenter', fontName='Helvetica', fontSize=9, leading=12, alignment=TA_CENTER)
    cell_right_bold = ParagraphStyle('CellRightBold', fontName='Helvetica-Bold', fontSize=9, leading=12, alignment=TA_RIGHT)
    cell_right_green = ParagraphStyle('CellRightGreen', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.HexColor('#005530'), alignment=TA_RIGHT)
    header_style = ParagraphStyle('HeaderStyle', fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=colors.white, alignment=TA_CENTER)

    # Executive Title & Metadata
    elements.append(Paragraph("NEXWARE ENTERPRISE OS — COMMODITY PRICE INTELLIGENCE", title_style))
    scope_str = str(payload.get("scope", "ALL")).upper()
    timestamp = datetime.now().strftime('%B %d, %Y at %I:%M %p')
    elements.append(Paragraph(f"<b>Scope / Time Range:</b> {scope_str} &nbsp;|&nbsp; <b>Generated On:</b> {timestamp}", sub_style))
    elements.append(Spacer(1, 15))

    dates_list = payload.get("dates", [])
    if not dates_list:
        elements.append(Paragraph("No historical records found for this scope.", styles['Normal']))
        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    for date_idx, date_block in enumerate(dates_list):
        if date_idx > 0:
            elements.append(Spacer(1, 18))

        d_str = date_block.get("date", "")
        d_fmt = date_block.get("date_formatted", d_str)
        date_banner_para = Paragraph(f"📅 &nbsp; MARKET RECORD DATE: {d_fmt} ({d_str})", date_header_style)
        date_banner = Table([[date_banner_para]], colWidths=[540])
        date_banner.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#1d5d42')),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('CORNERPAD', (0,0), (-1,-1), 0),
        ]))
        elements.append(date_banner)

        # Build daily pricing table
        # Columns: S.No (30), Commodity Name (175), Bag/Ctn Weight (75), Local Dubai (85), Int CIF (85), Int FOB (90) = 540
        table_data = [[
            Paragraph("<b>S.No</b>", header_style),
            Paragraph("<b>Commodity Item Name</b>", ParagraphStyle('HLeft', parent=header_style, alignment=TA_LEFT)),
            Paragraph("<b>Bag/Ctn Wt</b>", header_style),
            Paragraph("<b>Local Dubai Price</b>", ParagraphStyle('HRight', parent=header_style, alignment=TA_RIGHT)),
            Paragraph("<b>Int'l CIF ($)</b>", ParagraphStyle('HRight', parent=header_style, alignment=TA_RIGHT)),
            Paragraph("<b>Int'l FOB ($)</b>", ParagraphStyle('HRight', parent=header_style, alignment=TA_RIGHT)),
        ]]

        rows_data = date_block.get("rows", [])
        for idx, row_item in enumerate(rows_data, start=1):
            local_val = row_item.get("local_price", "—")
            table_data.append([
                Paragraph(str(row_item.get("sno", idx)), cell_center),
                Paragraph(str(row_item.get("commodity", "")), cell_left_bold),
                Paragraph(str(row_item.get("weight", "N/A")), cell_center),
                Paragraph(str(local_val), cell_right_green if local_val != "—" else cell_right_bold),
                Paragraph(str(row_item.get("cif_price", "—")), cell_right_bold),
                Paragraph(str(row_item.get("fob_price", "—")), cell_right_bold),
            ])

        t = Table(table_data, colWidths=[30, 175, 75, 85, 85, 90], repeatRows=1)
        t_style = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2b4c3a')),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 5),
            ('RIGHTPADDING', (0,0), (-1,-1), 5),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
        ]
        # Alternating zebra striping
        for r_idx in range(1, len(table_data)):
            bg = colors.HexColor('#ffffff') if r_idx % 2 != 0 else colors.HexColor('#f4f7f5')
            t_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), bg))

        t.setStyle(TableStyle(t_style))
        elements.append(t)

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

