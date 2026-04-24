from io import BytesIO

import pdfplumber

from .config import settings

_SPAN_SUFFIX = " […]"


class PdfNoTextError(ValueError):
    """Raised when a PDF yields no extractable text (e.g. image-only)."""


class PdfTextTooLargeError(ValueError):
    """Raised when extracted text exceeds ``settings.pdf_max_extract_chars``."""


def pdf_bytes_to_text(pdf_bytes: bytes) -> str:
    parts: list[str] = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            raw = page.extract_text()
            body = (raw or "").strip()
            if i == 1:
                parts.append(body)
            else:
                parts.append(f"\n\n--- Page {i} ---\n\n{body}")
    text = "".join(parts).strip()
    if not text:
        raise PdfNoTextError("PDF contained no extractable text (try a text-based PDF, not a scan).")
    if len(text) > settings.pdf_max_extract_chars:
        raise PdfTextTooLargeError(
            f"Extracted PDF text exceeds limit ({len(text)} chars > "
            f"{settings.pdf_max_extract_chars}); split the statement or raise the budget."
        )
    return text
