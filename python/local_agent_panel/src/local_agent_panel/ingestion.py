from __future__ import annotations

import csv
import io
import json
import zipfile
from dataclasses import dataclass


TEXT_EXTENSIONS = {"txt", "md", "json", "csv", "svg", "html"}
STRUCTURED_EXTENSIONS = {"xlsx"}
PDF_EXTENSIONS = {"pdf"}
STORE_ONLY_EXTENSIONS = {"dwg", "dxf", "ifc", "png", "jpg", "jpeg", "xls"}


@dataclass(frozen=True)
class IngestResult:
    tier: int
    preview_text: str | None
    preview_available: bool
    deep_ingest_available: bool
    warnings: list[str]


def ingest_preview(name: str, content: bytes, mime_type: str = "application/octet-stream") -> IngestResult:
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if extension in TEXT_EXTENSIONS or mime_type.startswith("text/"):
        return _text_preview(extension, content)
    if extension in STRUCTURED_EXTENSIONS:
        return _xlsx_preview(content)
    if extension in PDF_EXTENSIONS:
        return _pdf_preview(content)
    if extension in STORE_ONLY_EXTENSIONS:
        return IngestResult(
            tier=0,
            preview_text=None,
            preview_available=False,
            deep_ingest_available=False,
            warnings=[f"{extension or 'binary'} stored and hashed; deep parsing is not available in v1."],
        )
    return IngestResult(
        tier=0,
        preview_text=None,
        preview_available=False,
        deep_ingest_available=False,
        warnings=["Unknown file type stored and hashed only."],
    )


def _text_preview(extension: str, content: bytes) -> IngestResult:
    text = content.decode("utf-8", errors="replace")
    if extension == "json":
        try:
            parsed = json.loads(text)
            text = json.dumps(parsed, indent=2, ensure_ascii=False)
        except json.JSONDecodeError:
            pass
    if extension == "csv":
        try:
            rows = list(csv.reader(io.StringIO(text)))[:8]
            text = "\n".join(",".join(cell for cell in row) for row in rows)
        except csv.Error:
            pass
    return IngestResult(
        tier=1,
        preview_text=text[:1200],
        preview_available=True,
        deep_ingest_available=False,
        warnings=[],
    )


def _xlsx_preview(content: bytes) -> IngestResult:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            sheet_names = [name for name in archive.namelist() if name.startswith("xl/worksheets/")]
            preview = "XLSX workbook\nSheets:\n" + "\n".join(f"- {name}" for name in sheet_names[:20])
            return IngestResult(
                tier=2,
                preview_text=preview,
                preview_available=True,
                deep_ingest_available=False,
                warnings=["XLSX structured preview includes sheet inventory only in v1."],
            )
    except zipfile.BadZipFile:
        return IngestResult(
            tier=0,
            preview_text=None,
            preview_available=False,
            deep_ingest_available=False,
            warnings=["XLSX file could not be inspected as a zip archive."],
        )


def _pdf_preview(content: bytes) -> IngestResult:
    try:
        import pypdf  # type: ignore[import-not-found]
    except ImportError:
        return IngestResult(
            tier=0,
            preview_text=None,
            preview_available=False,
            deep_ingest_available=False,
            warnings=["PDF text extraction requires optional dependency pypdf."],
        )

    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:5])
        return IngestResult(
            tier=3,
            preview_text=text[:1200] if text else None,
            preview_available=bool(text),
            deep_ingest_available=False,
            warnings=[] if text else ["PDF text extraction found no selectable text."],
        )
    except Exception as exc:  # pragma: no cover - parser-specific edge cases
        return IngestResult(
            tier=0,
            preview_text=None,
            preview_available=False,
            deep_ingest_available=False,
            warnings=[f"PDF text extraction failed: {exc}"],
        )
