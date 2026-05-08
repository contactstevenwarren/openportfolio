"""Positions list/patch/delete/commit."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, Position, Provenance
from app.schemas import PositionCommit, PositionPatch, PositionRead
from app.services.commit_service import commit_positions as run_commit


def list_positions(db: Session, account_id: int | None) -> list[PositionRead]:
    if account_id is not None:
        if db.get(Account, account_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"account {account_id} not found",
            )
        rows = (
            db.query(Position)
            .filter(Position.account_id == account_id)
            .order_by(Position.id)
            .all()
        )
    else:
        rows = db.query(Position).order_by(Position.id).all()
    return [PositionRead.model_validate(p) for p in rows]


def patch_position(db: Session, position_id: int, body: PositionPatch) -> PositionRead:
    position = db.get(Position, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    now = datetime.now(UTC)
    patch_fields = body.model_dump(exclude_unset=True)
    changed_numeric_fields: list[tuple[str, float | None]] = []
    for field, value in patch_fields.items():
        setattr(position, field, value)
        if field in ("shares", "cost_basis", "market_value"):
            changed_numeric_fields.append((field, value))

    for field, value in changed_numeric_fields:
        if value is None:
            continue
        db.add(
            Provenance(
                entity_type="position",
                entity_id=position.id,
                field=field,
                source="override",
                confidence=1.0,
                llm_span=None,
                captured_at=now,
            )
        )

    db.commit()
    db.refresh(position)
    return PositionRead.model_validate(position)


def delete_position(db: Session, position_id: int) -> None:
    position = db.get(Position, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    db.delete(position)
    db.commit()


def commit_positions(db: Session, body: PositionCommit):
    return run_commit(db, body)
