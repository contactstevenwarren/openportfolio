"""Snapshot reads."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models import Snapshot
from app.schemas import SnapshotEarliest


def get_earliest_snapshot(db: Session) -> SnapshotEarliest | None:
    snap = db.query(Snapshot).order_by(Snapshot.taken_at.asc()).first()
    if snap is None:
        return None
    total: float | None = None
    try:
        payload = json.loads(snap.payload_json)
        raw = payload.get("total_usd")
        if raw is not None:
            total = float(raw)
    except Exception:
        pass
    return SnapshotEarliest(
        taken_at=snap.taken_at,
        net_worth_usd=snap.net_worth_usd,
        total_usd=total,
    )
