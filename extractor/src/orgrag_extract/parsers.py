"""Document parsers: normalize PDF / DOCX / XML / JSON / text into markdown sections.

Every format lands in one shape so nothing downstream has to know the source type --
markdown for the existing chunker, plus a per-section ``source_span`` so a retrieved
chunk can be traced back to its position in the original document. Traceability is the
whole point: an answer that cites ``p.7`` or ``xpath:/spec/requirement[3]`` is checkable,
one that cites only a filename is not.

Two failure modes are raised explicitly because both are silent by default:

* A **scanned** PDF has no text layer. pdfplumber returns empty strings without
  complaining, which would index an empty document and look like success. We raise
  ``NeedsOcrError`` instead.
* A **partially** parsed document is worse than a rejected one -- half the content lands
  in the index with no signal that anything is missing. We raise ``ParseError`` and let
  the caller route the file to the dead-letter path.

Third-party parsers are imported inside their own functions so a missing optional
dependency produces a one-line "install X" message rather than an ImportError at import
time. No parser in this module requires an external API or credential.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

# Below this many characters per page a PDF is almost certainly a scan without a text
# layer. 50 is deliberately low so that sparse cover pages and slide decks still clear it.
_MIN_CHARS_PER_PAGE = 50

# Extensions this module turns into markdown. Kept in sync with KIND_BY_EXT in
# apps/api/src/routes/documents.ts.
SUPPORTED_EXTENSIONS = ("md", "markdown", "txt", "csv", "pdf", "docx", "xml", "json")


class ParseError(RuntimeError):
    """The file could not be parsed. Callers should route it to the DLQ."""


class NeedsOcrError(ParseError):
    """Image-only PDF. Distinct from ParseError on purpose: the file is not corrupt, it
    simply needs an OCR pass before it can be indexed, and the operator should see that
    as a different class of failure."""


@dataclass(frozen=True)
class ParsedSection:
    heading: str
    text: str
    source_span: str  # "p.4", "para:12-18", "xpath:/spec/requirement[3]", "json:$.orders[0]"


@dataclass(frozen=True)
class ParsedDocument:
    markdown: str
    sections: list[ParsedSection]
    parser: str
    warnings: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------------------
# Dispatcher
# --------------------------------------------------------------------------------------

def parse_document(path: Path) -> ParsedDocument:
    """Parse one file into markdown + citable sections.

    Raises ParseError (route to DLQ) or NeedsOcrError (flag for an OCR pass).
    """
    path = Path(path)
    if not path.exists():
        raise ParseError(f"file not found: {path}")

    ext = path.suffix.lower().lstrip(".")
    handler = _HANDLERS.get(ext)
    if handler is None:
        raise ParseError(
            f"unsupported extension '.{ext}' (supported: {', '.join(SUPPORTED_EXTENSIONS)})"
        )
    return handler(path)


# --------------------------------------------------------------------------------------
# Text-like formats: already markdown-ish, just split on headings so spans exist
# --------------------------------------------------------------------------------------

def _parse_text(path: Path, parser: str = "passthrough") -> ParsedDocument:
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise ParseError(f"could not read {path.name}: {exc}") from exc

    if not raw.strip():
        raise ParseError(f"{path.name}: file is empty")

    sections: list[ParsedSection] = []
    heading: str | None = None
    buffer: list[str] = []
    start_line = 1

    for line_no, line in enumerate(raw.splitlines(), start=1):
        if line.startswith("#"):
            if buffer:
                sections.append(
                    ParsedSection(
                        heading=heading or path.stem,
                        text="\n".join(buffer).strip(),
                        source_span=f"line:{start_line}-{line_no - 1}",
                    )
                )
                buffer = []
            heading = line.lstrip("#").strip() or path.stem
            start_line = line_no
            continue
        buffer.append(line)

    if buffer:
        sections.append(
            ParsedSection(
                heading=heading or path.stem,
                text="\n".join(buffer).strip(),
                source_span=f"line:{start_line}-{len(raw.splitlines())}",
            )
        )

    sections = [s for s in sections if s.text]
    if not sections:
        raise ParseError(f"{path.name}: no text content found")

    return ParsedDocument(_assemble(sections), sections, parser)


# --------------------------------------------------------------------------------------
# PDF
# --------------------------------------------------------------------------------------

def _parse_pdf(path: Path) -> ParsedDocument:
    try:
        import pdfplumber
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise ParseError(
            "pdfplumber is not installed -- add the parsers extra (uv sync --extra parsers)"
        ) from exc

    sections: list[ParsedSection] = []
    warnings: list[str] = []
    page_count = 0

    try:
        with pdfplumber.open(str(path)) as pdf:
            page_count = len(pdf.pages)
            for page_no, page in enumerate(pdf.pages, start=1):
                text = (page.extract_text() or "").strip()
                if text:
                    sections.append(
                        ParsedSection(heading=f"Page {page_no}", text=text, source_span=f"p.{page_no}")
                    )
                for table_no, table in enumerate(page.extract_tables() or [], start=1):
                    rendered = _table_to_markdown(table)
                    if rendered:
                        sections.append(
                            ParsedSection(
                                heading=f"Page {page_no} table {table_no}",
                                text=rendered,
                                source_span=f"p.{page_no}#table{table_no}",
                            )
                        )
    except ParseError:
        raise
    except Exception as exc:  # noqa: BLE001 - third-party parser surface
        raise ParseError(f"pdfplumber failed on {path.name}: {exc}") from exc

    total_chars = sum(len(s.text) for s in sections)
    if page_count == 0:
        raise ParseError(f"{path.name}: PDF has no pages")
    per_page = total_chars / page_count
    if per_page < _MIN_CHARS_PER_PAGE:
        raise NeedsOcrError(
            f"{path.name}: {total_chars} characters across {page_count} pages "
            f"({per_page:.0f}/page) -- looks like a scanned PDF with no text layer. "
            f"Run an OCR pass before ingesting; do not index an empty document."
        )

    if total_chars < 500:
        warnings.append(
            f"only {total_chars} characters extracted -- verify the PDF's text layer is complete"
        )

    return ParsedDocument(_assemble(sections), sections, "pdfplumber", warnings)


def _table_to_markdown(table: list[list[Any]]) -> str:
    """Render a pdfplumber table (list of rows) as a markdown table."""
    rows = [[("" if cell is None else str(cell)).replace("|", "\\|").replace("\n", " ").strip()
             for cell in row] for row in table]
    rows = [r for r in rows if any(c for c in r)]
    if not rows:
        return ""

    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    header, *body = rows
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines += ["| " + " | ".join(r) + " |" for r in body]
    return "\n".join(lines)


# --------------------------------------------------------------------------------------
# DOCX
# --------------------------------------------------------------------------------------

def _parse_docx(path: Path) -> ParsedDocument:
    try:
        from docx import Document as DocxDocument
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise ParseError(
            "python-docx is not installed -- add the parsers extra (uv sync --extra parsers)"
        ) from exc

    try:
        document = DocxDocument(str(path))
    except Exception as exc:  # noqa: BLE001 - third-party parser surface
        raise ParseError(f"python-docx failed on {path.name}: {exc}") from exc

    sections: list[ParsedSection] = []
    heading_stack: list[str] = []
    buffer: list[str] = []
    span_start = 1

    def close(end: int) -> None:
        text = "\n".join(buffer).strip()
        if text:
            sections.append(
                ParsedSection(
                    heading=" > ".join(heading_stack) or "(preamble)",
                    text=text,
                    source_span=f"para:{span_start}-{max(end, span_start)}",
                )
            )

    paragraphs = list(document.paragraphs)
    for index, paragraph in enumerate(paragraphs, start=1):
        text = paragraph.text.strip()
        if not text:
            continue
        level = _heading_level(paragraph.style.name if paragraph.style else "")
        if level:
            close(index - 1)
            del heading_stack[level - 1:]
            heading_stack.append(text)
            buffer = []
            span_start = index
            continue
        buffer.append(text)

    close(len(paragraphs))

    # Tables carry requirements as often as paragraphs do -- keep them.
    for table_no, table in enumerate(document.tables, start=1):
        rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        rendered = _table_to_markdown(rows)
        if rendered:
            sections.append(
                ParsedSection(
                    heading=f"Table {table_no}",
                    text=rendered,
                    source_span=f"table:{table_no}",
                )
            )

    if not sections:
        raise ParseError(f"{path.name}: no paragraphs or tables with text")

    return ParsedDocument(_assemble(sections), sections, "python-docx")


def _heading_level(style_name: str) -> int:
    """Map a Word paragraph style onto a heading depth. 0 means "not a heading"."""
    match = re.match(r"heading\s*(\d+)", style_name.strip().lower())
    return int(match.group(1)) if match else 0


# --------------------------------------------------------------------------------------
# XML
# --------------------------------------------------------------------------------------

def _parse_xml(path: Path) -> ParsedDocument:
    try:
        from lxml import etree
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise ParseError(
            "lxml is not installed -- add the parsers extra (uv sync --extra parsers)"
        ) from exc

    try:
        tree = etree.parse(str(path))
    except Exception as exc:  # noqa: BLE001 - third-party parser surface
        raise ParseError(f"lxml failed on {path.name}: {exc}") from exc

    root = tree.getroot()
    sections: list[ParsedSection] = []
    for element in root.iter():
        if element is root:
            continue
        text = " ".join("".join(element.itertext()).split())
        if not text:
            continue
        sections.append(
            ParsedSection(
                heading=etree.QName(element).localname,
                text=text,
                source_span=f"xpath:{tree.getpath(element)}",
            )
        )

    if not sections:
        raise ParseError(f"{path.name}: XML parsed but no text content was found")

    return ParsedDocument(_assemble(sections), sections, "lxml")


# --------------------------------------------------------------------------------------
# JSON
# --------------------------------------------------------------------------------------

def _parse_json(path: Path) -> ParsedDocument:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ParseError(f"could not read {path.name}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ParseError(f"{path.name}: invalid JSON at line {exc.lineno}: {exc.msg}") from exc

    leaves = _flatten_json(payload)
    sections: list[ParsedSection] = []

    if leaves:
        # One `path = value` line per leaf: chunkers work on prose, and the path doubles
        # as the citable span.
        sections.append(
            ParsedSection(
                heading="flattened fields",
                text="\n".join(leaves),
                source_span="json:fields",
            )
        )
    sections.append(
        ParsedSection(
            heading="raw document",
            text="```json\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```",
            source_span="json:raw",
        )
    )
    return ParsedDocument(_assemble(sections), sections, "json")


def _flatten_json(value: Any, prefix: str = "$", out: list[str] | None = None,
                  limit: int = 2000) -> list[str]:
    """Render nested JSON as one ``path = value`` line per scalar leaf."""
    if out is None:
        out = []
    if len(out) >= limit:
        return out

    if isinstance(value, dict):
        for key, item in value.items():
            _flatten_json(item, f"{prefix}.{key}", out, limit)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _flatten_json(item, f"{prefix}[{index}]", out, limit)
    elif value is not None and str(value).strip():
        out.append(f"{prefix} = {value}")
    return out


# --------------------------------------------------------------------------------------
# Shared
# --------------------------------------------------------------------------------------

def _assemble(sections: list[ParsedSection]) -> str:
    """Join sections into the markdown the rest of the pipeline already consumes."""
    return "\n\n".join(f"# {s.heading}\n\n{s.text}" for s in sections)


_HANDLERS: dict[str, Callable[[Path], ParsedDocument]] = {
    "md": _parse_text,
    "markdown": _parse_text,
    "txt": _parse_text,
    "csv": _parse_text,
    "pdf": _parse_pdf,
    "docx": _parse_docx,
    "xml": _parse_xml,
    "json": _parse_json,
}


# --------------------------------------------------------------------------------------
# CLI: python -m orgrag_extract.parsers <file> [--dump]
# --------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    arg_parser = argparse.ArgumentParser(
        prog="orgrag-parsers", description="Parse one document and print a summary."
    )
    arg_parser.add_argument("file", help=f"one of: {', '.join(SUPPORTED_EXTENSIONS)}")
    arg_parser.add_argument("--dump", action="store_true", help="also print the normalized markdown")
    args = arg_parser.parse_args(argv)

    try:
        doc = parse_document(Path(args.file))
    except NeedsOcrError as exc:
        print(f"NEEDS OCR: {exc}")
        return 2
    except ParseError as exc:
        print(f"PARSE FAILED: {exc}")
        return 1

    print(f"parser={doc.parser} sections={len(doc.sections)} chars={len(doc.markdown)}")
    for section in doc.sections[:8]:
        preview = section.text[:60].replace("\n", " ")
        print(f"  [{section.source_span}] {section.heading} -- {preview}...")
    if len(doc.sections) > 8:
        print(f"  ... {len(doc.sections) - 8} more section(s)")
    for warning in doc.warnings:
        print(f"  warn: {warning}")
    if args.dump:
        print("\n" + doc.markdown)

    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    import sys

    sys.exit(main())
