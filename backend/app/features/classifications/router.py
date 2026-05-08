from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from . import service as classifications_svc
from .schemas import (
    ClassificationPatch,
    ClassificationRow,
    ClassificationSuggestItem,
    ClassificationSuggestRequest,
    Taxonomy,
)

router = APIRouter(
    prefix="/api/classifications",
    tags=["classifications"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("/taxonomy", summary="L1/L2 taxonomy reference")
def get_taxonomy() -> Taxonomy:
    return classifications_svc.taxonomy_from_locked()


@router.post("/suggest", summary="LLM classification hints for unclassified tickers")
def suggest_classifications(
    body: ClassificationSuggestRequest, db: Session = Depends(get_db)
) -> list[ClassificationSuggestItem]:
    return classifications_svc.suggest_classifications(db, body)


@router.get("", summary="List all classifications (YAML seed + user overrides)")
def list_classifications(db: Session = Depends(get_db)) -> list[ClassificationRow]:
    return classifications_svc.list_classifications(db)


@router.patch("/{ticker}", summary="Upsert a user classification override")
def patch_classification(
    ticker: str, body: ClassificationPatch, db: Session = Depends(get_db)
) -> ClassificationRow:
    return classifications_svc.patch_classification(db, ticker, body)


@router.delete(
    "/{ticker}",
    summary="Revert a user classification override to the YAML baseline",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_classification(ticker: str, db: Session = Depends(get_db)) -> None:
    classifications_svc.delete_classification(db, ticker)
