"""Full export and destructive reset."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import (
    Account,
    Liability,
    Position,
    Provenance,
    Snapshot,
    Target,
)
from app.schemas import (
    AccountRead,
    ExportResult,
    LiabilityRead,
    PositionRead,
    ProvenanceRead,
    SnapshotRead,
)


def export_all(db: Session) -> ExportResult:
    return ExportResult(
        exported_at=datetime.now(UTC),
        accounts=[
            AccountRead.model_validate(a)
            for a in db.query(Account).order_by(Account.id).all()
        ],
        positions=[
            PositionRead.model_validate(p)
            for p in db.query(Position).order_by(Position.id).all()
        ],
        provenance=[
            ProvenanceRead.model_validate(p)
            for p in db.query(Provenance).order_by(Provenance.id).all()
        ],
        snapshots=[
            SnapshotRead.model_validate(s)
            for s in db.query(Snapshot).order_by(Snapshot.id).all()
        ],
        liabilities=[
            LiabilityRead.model_validate(r)
            for r in db.query(Liability).order_by(Liability.id).all()
        ],
    )


def reset_all(db: Session) -> None:
    db.execute(delete(Position))
    db.execute(delete(Account))
    db.execute(delete(Target))
    db.execute(delete(Snapshot))
    db.execute(delete(Provenance))
    db.execute(delete(Liability))
    db.commit()
