"""Snapshot reads."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models import Snapshot
from .schemas import SnapshotEarliest, SnapshotListItem


def get_earliest_snapshot(db: Session) -> SnapshotEarliest | None:
    snap = db.query(Snapshot).order_by(Snapshot.taken_at.asc()).first()
    if snap is None:
        return None
    investable, _ = _parse_snapshot_payload(snap.payload_json)
    return SnapshotEarliest(
        taken_at=snap.taken_at,
        net_worth_usd=snap.net_worth_usd,
        total_usd=investable,
    )


def _parse_snapshot_payload(payload_json: str) -> tuple[float, dict[str, float]]:
    investable = 0.0
    by_ac: dict[str, float] = {}
    try:
        payload = json.loads(payload_json)
        raw = payload.get("total_usd")
        if raw is not None:
            investable = float(raw)
        bac = payload.get("by_asset_class") or {}
        if isinstance(bac, dict):
            for name, blob in bac.items():
                key = str(name)
                if isinstance(blob, dict) and "value" in blob:
                    by_ac[key] = float(blob["value"])
                elif isinstance(blob, (int, float)):
                    by_ac[key] = float(blob)
    except Exception:
        pass
    return investable, by_ac


def list_snapshots(db: Session, *, limit: int = 500) -> list[SnapshotListItem]:
    """Return snapshots oldest-first for timeline charts (investable scope in payload)."""
    rows = db.query(Snapshot).order_by(Snapshot.taken_at.asc()).limit(limit).all()
    out: list[SnapshotListItem] = []
    for s in rows:
        inv, by_ac = _parse_snapshot_payload(s.payload_json)
        out.append(
            SnapshotListItem(
                taken_at=s.taken_at,
                investable_total_usd=inv,
                by_asset_class=by_ac,
            )
        )
    return out
