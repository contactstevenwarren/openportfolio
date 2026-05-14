from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from . import service as positions_svc
from .schemas import (
    CommitResult,
    PositionCommit,
    PositionPatch,
    PositionRead,
)

router = APIRouter(
    prefix="/api/positions",
    tags=["positions"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", summary="List positions (optionally filtered by account)")
def list_positions(
    account_id: int | None = Query(None),
    db: Session = Depends(get_db),
) -> list[PositionRead]:
    return positions_svc.list_positions(db, account_id)


@router.post(
    "/commit",
    summary="Commit extracted positions to an account",
    status_code=status.HTTP_201_CREATED,
)
def commit_positions(
    body: PositionCommit, db: Session = Depends(get_db)
) -> CommitResult:
    return positions_svc.commit_positions(db, body)


@router.patch("/{position_id}", summary="Update a position")
def patch_position(
    position_id: int, body: PositionPatch, db: Session = Depends(get_db)
) -> PositionRead:
    return positions_svc.patch_position(db, position_id, body)


@router.delete(
    "/{position_id}",
    summary="Delete a position",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_position(position_id: int, db: Session = Depends(get_db)) -> None:
    positions_svc.delete_position(db, position_id)
