"""Net-worth snapshot writes and liability totals used after mutations."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from app.allocation import aggregate
from app.classifications import load_classifications, load_user_classifications
from app.models import Account, Liability, Position, Snapshot


def non_investable_account_ids(db: Session) -> frozenset[int]:
    """Return account IDs whose positions are excluded from Investment Portfolio."""
    return frozenset(
        a.id for a in db.query(Account).filter(Account.is_investable.is_(False)).all()
    )


def liabilities_total(db: Session) -> float:
    """Sum of all liability balances (0.0 when no rows exist)."""
    result = db.query(sqlfunc.sum(Liability.balance)).scalar()
    return float(result) if result is not None else 0.0


def write_snapshot(db: Session) -> None:
    """Persist one Snapshot row summarising current portfolio state."""
    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    result = aggregate(
        positions,
        classifications,
        db=db,
        non_investable_account_ids=non_investable_account_ids(db),
    )
    liabilities = liabilities_total(db)
    net_worth = result.assets_total - liabilities

    payload = {
        "total_usd": result.total,
        "assets_total_usd": result.assets_total,
        "liabilities_total_usd": liabilities,
        "net_worth_usd": net_worth,
        "by_asset_class": {
            s.name: {"value": s.value, "pct": s.pct} for s in result.by_asset_class
        },
        "unclassified_count": len(result.unclassified_tickers),
    }
    db.add(
        Snapshot(
            taken_at=datetime.now(UTC),
            net_worth_usd=net_worth,
            payload_json=json.dumps(payload, sort_keys=True),
        )
    )
    db.commit()
