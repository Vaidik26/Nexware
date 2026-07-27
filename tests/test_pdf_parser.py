"""
Tests for PDF LPO parser.
"""
import pytest
import os
from backend.services.pdf_parser import parse_lpo_pdf

SAMPLE_PDF = os.path.join(
    os.path.dirname(__file__),
    "..",
    "Developer_Assessment",
    "Developer_Assessment",
    "Task 1 - LPO to Pick List",
    "LPOSample_Type1.pdf",
)


@pytest.mark.skipif(not os.path.exists(SAMPLE_PDF), reason="Sample PDF not available")
def test_parse_lpo_returns_structure():
    result = parse_lpo_pdf(SAMPLE_PDF)
    assert "order_number" in result
    assert "items" in result
    assert isinstance(result["items"], list)


@pytest.mark.skipif(not os.path.exists(SAMPLE_PDF), reason="Sample PDF not available")
def test_parse_lpo_extracts_items():
    result = parse_lpo_pdf(SAMPLE_PDF)
    assert len(result["items"]) > 0
    item = result["items"][0]
    assert "barcode" in item
    assert "quantity" in item
    assert len(item["barcode"]) > 5


@pytest.mark.skipif(not os.path.exists(SAMPLE_PDF), reason="Sample PDF not available")
def test_parse_lpo_extracts_order_number():
    result = parse_lpo_pdf(SAMPLE_PDF)
    assert result["order_number"] != ""
