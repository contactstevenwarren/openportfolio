from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.llm import extract_positions
from app.models import Account
from app.pdf_text import PdfNoTextError, PdfTextTooLargeError, pdf_bytes_to_text
from app.scrub_digits import scrub_digit_runs

from .schemas import ExtractionResult, ExtractRequest


def account_tuples(db: Session) -> list[tuple[int, str, str]]:
    return [(a.id, a.label, a.type) for a in db.query(Account).order_by(Account.id).all()]


def extract_from_text(body: ExtractRequest, db: Session) -> ExtractionResult:
    return extract_positions(body.text, accounts=account_tuples(db))


def extract_from_pdf(raw: bytes, db: Session) -> ExtractionResult:
    if not raw.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="File is not a valid PDF (missing %PDF header).",
        )
    try:
        text = pdf_bytes_to_text(raw)
    except PdfNoTextError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(e),
        ) from e
    except PdfTextTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(e),
        ) from e
    scrubbed, _redactions = scrub_digit_runs(text)
    return extract_positions(scrubbed, accounts=account_tuples(db))
