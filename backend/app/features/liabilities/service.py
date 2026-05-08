"""Liabilities CRUD."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Liability, Provenance
from app.schemas import LiabilityCreate, LiabilityPatch, LiabilityRead
from app.services.portfolio_snapshot import write_snapshot


def list_liabilities(db: Session) -> list[LiabilityRead]:
    rows = db.query(Liability).order_by(Liability.as_of.desc()).all()
    return [LiabilityRead.model_validate(r) for r in rows]


def create_liability(db: Session, body: LiabilityCreate) -> LiabilityRead:
    now = datetime.now(UTC)
    row = Liability(
        label=body.label,
        kind=body.kind,
        balance=body.balance,
        as_of=body.as_of,
        institution_id=body.institution_id,
        notes=body.notes,
        source="manual",
    )
    db.add(row)
    db.flush()
    db.add(
        Provenance(
            entity_type="liability",
            entity_id=row.id,
            field="balance",
            source="manual",
            confidence=1.0,
            llm_span=None,
            captured_at=now,
        )
    )
    db.commit()
    write_snapshot(db)
    db.refresh(row)
    return LiabilityRead.model_validate(row)


def patch_liability(
    db: Session, liability_id: int, body: LiabilityPatch
) -> LiabilityRead:
    row = db.get(Liability, liability_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    now = datetime.now(UTC)
    patch_fields = body.model_dump(exclude_unset=True)
    balance_changed = "balance" in patch_fields and patch_fields["balance"] != row.balance
    timeline_changed = balance_changed or (
        "as_of" in patch_fields and patch_fields["as_of"] != row.as_of
    )

    for field, value in patch_fields.items():
        setattr(row, field, value)

    if balance_changed:
        db.add(
            Provenance(
                entity_type="liability",
                entity_id=liability_id,
                field="balance",
                source="override",
                confidence=1.0,
                llm_span=None,
                captured_at=now,
            )
        )

    db.commit()
    if timeline_changed:
        write_snapshot(db)
    db.refresh(row)
    return LiabilityRead.model_validate(row)


def delete_liability(db: Session, liability_id: int) -> None:
    row = db.get(Liability, liability_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    db.delete(row)
    db.commit()
    write_snapshot(db)
