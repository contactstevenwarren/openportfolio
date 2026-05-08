"""Targets GET/PUT."""

from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.allocation import aggregate
from app.classifications import load_classifications, load_user_classifications
from app.models import Position, Target
from app.schemas import TargetsPayload
from app.services.portfolio_snapshot import non_investable_account_ids
from app.services.targets_validation import (
    get_targets_payload,
    validate_put_targets,
)


def get_targets(db: Session) -> dict[str, object]:
    return get_targets_payload(db)


def put_targets(db: Session, body: TargetsPayload) -> dict[str, object]:
    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    result = aggregate(
        positions,
        classifications,
        db=db,
        non_investable_account_ids=non_investable_account_ids(db),
    )
    validate_put_targets(body, result)

    db.execute(delete(Target))
    for r in body.root:
        db.add(Target(path=r.path, pct=r.pct))
    for rows in body.groups.values():
        for r in rows:
            db.add(Target(path=r.path, pct=r.pct))
    db.commit()
    return get_targets_payload(db)
