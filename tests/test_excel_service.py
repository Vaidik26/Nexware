"""
Tests for Excel service (catalogue import/export + pick list export).
"""
import pytest
import pandas as pd
from io import BytesIO
from backend.services.excel_service import parse_catalogue_excel, generate_catalogue_excel


def _make_catalogue_excel(rows: list[dict]) -> bytes:
    df = pd.DataFrame(rows)
    buf = BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


def test_parse_catalogue_excel_basic():
    rows = [
        {"Item Number": "ITM001", "Item Name": "Test Item", "Barcode": "123456789", "Unit": "NOS", "Description": "Desc"},
    ]
    content = _make_catalogue_excel(rows)
    result = parse_catalogue_excel(content)
    assert len(result) == 1
    assert result[0]["item_number"] == "ITM001"
    assert result[0]["barcode"] == "123456789"


def test_parse_catalogue_excel_filters_empty_rows():
    rows = [
        {"Item Number": "ITM001", "Item Name": "Item", "Barcode": "111", "Unit": "KG", "Description": ""},
        {"Item Number": "", "Item Name": "", "Barcode": "", "Unit": "", "Description": ""},
    ]
    content = _make_catalogue_excel(rows)
    result = parse_catalogue_excel(content)
    assert len(result) == 1


def test_generate_catalogue_excel_roundtrip():
    class FakeItem:
        def __init__(self):
            self.item_number = "X001"
            self.item_name = "Rice"
            self.barcode = "9876543210"
            self.unit = "KG"
            self.description = "Premium rice"

    excel_bytes = generate_catalogue_excel([FakeItem()])
    df = pd.read_excel(BytesIO(excel_bytes), sheet_name="Sales Items")
    assert "Item Number" in df.columns
    assert df.iloc[0]["Item Number"] == "X001"
