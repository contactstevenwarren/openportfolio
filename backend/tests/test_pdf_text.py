from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

from app.config import settings
from app.pdf_text import (
    PdfNoTextError,
    PdfTextTooLargeError,
    pdf_bytes_to_text,
)


def _fake_pdf_cm(pages: list[MagicMock]) -> MagicMock:
    inner = MagicMock()
    inner.pages = pages
    cm = MagicMock()
    cm.__enter__.return_value = inner
    cm.__exit__.return_value = None
    return cm


@patch("app.pdf_text.pdfplumber")
def test_pdf_bytes_to_text_multipage(mock_plumber: MagicMock) -> None:
    p1 = MagicMock()
    p1.extract_text.return_value = "  hello  "
    p2 = MagicMock()
    p2.extract_text.return_value = "world"
    mock_plumber.open.return_value = _fake_pdf_cm([p1, p2])

    text = pdf_bytes_to_text(b"%PDF-fake")
    assert text.startswith("hello")
    assert "\n\n--- Page 2 ---\n\nworld" in text
    mock_plumber.open.assert_called_once()
    bio = mock_plumber.open.call_args[0][0]
    assert isinstance(bio, BytesIO)


@patch("app.pdf_text.pdfplumber")
def test_pdf_bytes_to_text_empty_raises(mock_plumber: MagicMock) -> None:
    p = MagicMock()
    p.extract_text.return_value = None
    mock_plumber.open.return_value = _fake_pdf_cm([p])

    with pytest.raises(PdfNoTextError, match="no extractable text"):
        pdf_bytes_to_text(b"x")


@patch("app.pdf_text.pdfplumber")
def test_pdf_bytes_to_text_too_large(mock_plumber: MagicMock) -> None:
    p = MagicMock()
    p.extract_text.return_value = "x" * 50_000
    mock_plumber.open.return_value = _fake_pdf_cm([p])

    with patch.object(settings, "pdf_max_extract_chars", 100):
        with pytest.raises(PdfTextTooLargeError, match="exceeds limit"):
            pdf_bytes_to_text(b"x")


def test_pdf_errors_subclass_valueerror() -> None:
    assert issubclass(PdfNoTextError, ValueError)
    assert issubclass(PdfTextTooLargeError, ValueError)
