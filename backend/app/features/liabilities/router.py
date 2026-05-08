from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from . import service as liabilities_svc
from .schemas import LiabilityCreate, LiabilityPatch, LiabilityRead

router = APIRouter(
    prefix="/api/liabilities",
    tags=["liabilities"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", summary="List all liabilities")
def list_liabilities(db: Session = Depends(get_db)) -> list[LiabilityRead]:
    return liabilities_svc.list_liabilities(db)


@router.post(
    "",
    summary="Create a liability",
    status_code=status.HTTP_201_CREATED,
)
def create_liability(
    body: LiabilityCreate, db: Session = Depends(get_db)
) -> LiabilityRead:
    return liabilities_svc.create_liability(db, body)


@router.patch("/{liability_id}", summary="Update a liability")
def patch_liability(
    liability_id: int, body: LiabilityPatch, db: Session = Depends(get_db)
) -> LiabilityRead:
    return liabilities_svc.patch_liability(db, liability_id, body)


@router.delete(
    "/{liability_id}",
    summary="Delete a liability",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_liability(liability_id: int, db: Session = Depends(get_db)) -> None:
    liabilities_svc.delete_liability(db, liability_id)
