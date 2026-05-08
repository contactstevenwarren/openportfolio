from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db

from . import service as extract_svc
from .schemas import ExtractionResult, ExtractRequest

router = APIRouter(
    prefix="/api/extract",
    tags=["extract"],
    dependencies=[Depends(require_admin_token)],
)


@router.post("", summary="Extract positions from pasted text")
def extract(body: ExtractRequest, db: Session = Depends(get_db)) -> ExtractionResult:
    return extract_svc.extract_from_text(body, db)


@router.post("/pdf", summary="Extract positions from a PDF file")
def extract_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ExtractionResult:
    raw = file.file.read()
    return extract_svc.extract_from_pdf(raw, db)
