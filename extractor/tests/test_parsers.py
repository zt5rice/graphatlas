"""Parser tests.

Formats that need the optional ``parsers`` extra are skipped when it is absent, so the
default test run stays green without extra dependencies. The two PDF tests are the
important ones: they pin the failure mode that matters most -- a scanned PDF must raise
``NeedsOcrError`` rather than quietly returning an empty document.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from orgrag_extract.parsers import (
    NeedsOcrError,
    ParseError,
    parse_document,
)

# A valid single-page PDF with no text layer and no font resources. Hand-built so the
# OCR-detection test needs no PDF-writing dependency.
BLANK_PDF = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
trailer<</Root 1 0 R>>
"""


# --------------------------------------------------------------------------- text

def test_markdown_splits_on_headings(tmp_path: Path) -> None:
    path = tmp_path / "spec.md"
    path.write_text("# Requirements\n\nSSO is required.\n\n# Recovery\n\nSessions expire.\n")

    doc = parse_document(path)

    assert doc.parser == "passthrough"
    assert [s.heading for s in doc.sections] == ["Requirements", "Recovery"]
    assert doc.sections[0].source_span.startswith("line:")
    assert "# Requirements" in doc.markdown


def test_text_file_without_headings_is_one_section(tmp_path: Path) -> None:
    path = tmp_path / "notes.txt"
    path.write_text("plain prose with no headings")

    doc = parse_document(path)

    assert len(doc.sections) == 1
    assert doc.sections[0].heading == "notes"


def test_empty_file_raises_parse_error(tmp_path: Path) -> None:
    path = tmp_path / "empty.txt"
    path.write_text("   \n  ")

    with pytest.raises(ParseError, match="empty"):
        parse_document(path)


def test_unsupported_extension_raises_parse_error(tmp_path: Path) -> None:
    path = tmp_path / "archive.zip"
    path.write_bytes(b"PK\x03\x04")

    with pytest.raises(ParseError, match="unsupported extension"):
        parse_document(path)


def test_missing_file_raises_parse_error(tmp_path: Path) -> None:
    with pytest.raises(ParseError, match="file not found"):
        parse_document(tmp_path / "nope.md")


# --------------------------------------------------------------------------- json

def test_json_flattens_leaves_and_keeps_raw(tmp_path: Path) -> None:
    path = tmp_path / "req.json"
    path.write_text(json.dumps({
        "requirement": {"id": "REQ-1", "title": "Support SSO"},
        "tests": [{"id": "T-1", "covers": "REQ-1"}],
    }))

    doc = parse_document(path)

    assert doc.parser == "json"
    flattened = doc.sections[0].text
    assert "$.requirement.id = REQ-1" in flattened
    assert "$.tests[0].covers = REQ-1" in flattened
    # the raw block stays so nothing is lost to flattening
    assert doc.sections[1].text.startswith("```json")


def test_invalid_json_raises_parse_error(tmp_path: Path) -> None:
    path = tmp_path / "broken.json"
    path.write_text('{"a": 1,')

    with pytest.raises(ParseError, match="invalid JSON"):
        parse_document(path)


# --------------------------------------------------------------------------- xml

def test_xml_uses_xpath_as_source_span(tmp_path: Path) -> None:
    pytest.importorskip("lxml")
    path = tmp_path / "spec.xml"
    path.write_text(
        '<spec><requirement id="R1">SSO required.</requirement>'
        '<requirement id="R2">Sessions expire.</requirement></spec>'
    )

    doc = parse_document(path)

    assert doc.parser == "lxml"
    assert doc.sections[0].source_span == "xpath:/spec/requirement[1]"
    assert doc.sections[1].source_span == "xpath:/spec/requirement[2]"


def test_xml_without_text_content_raises(tmp_path: Path) -> None:
    pytest.importorskip("lxml")
    path = tmp_path / "empty.xml"
    path.write_text("<spec><empty/><empty/></spec>")

    with pytest.raises(ParseError, match="no text content"):
        parse_document(path)


# --------------------------------------------------------------------------- docx

def test_docx_builds_heading_hierarchy(tmp_path: Path) -> None:
    docx = pytest.importorskip("docx")
    path = tmp_path / "spec.docx"
    document = docx.Document()
    document.add_heading("Requirements", level=1)
    document.add_paragraph("The system shall support SSO.")
    document.add_heading("Recovery", level=2)
    document.add_paragraph("Sessions expire after 30 minutes.")
    document.save(path)

    parsed = parse_document(path)

    assert parsed.parser == "python-docx"
    assert parsed.sections[0].heading == "Requirements"
    assert parsed.sections[1].heading == "Requirements > Recovery"
    assert parsed.sections[0].source_span.startswith("para:")


# --------------------------------------------------------------------------- pdf

def test_scanned_pdf_raises_needs_ocr_not_empty_document(tmp_path: Path) -> None:
    """The failure mode this whole module exists to prevent."""
    pytest.importorskip("pdfplumber")
    path = tmp_path / "scanned.pdf"
    path.write_bytes(BLANK_PDF)

    with pytest.raises(NeedsOcrError, match="scanned PDF"):
        parse_document(path)


def test_needs_ocr_is_a_parse_error_subclass() -> None:
    # Callers that only catch ParseError must still route scanned files somewhere safe.
    assert issubclass(NeedsOcrError, ParseError)
