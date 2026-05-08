"""Rebalance suggestions."""

from __future__ import annotations

import math
from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.allocation import aggregate, meaningful_children
from app.classifications import load_classifications, load_user_classifications
from app.config import settings
from app.drift import apply_drift
from app.models import Position, Target
from app.rebalance import compute_new_money, compute_rebalance
from app.schemas import RebalanceResult
from app.services.portfolio_snapshot import non_investable_account_ids


def get_rebalance(
    db: Session,
    mode: Literal["full", "new_money"],
    amount: float | None,
) -> RebalanceResult:
    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    result = aggregate(
        positions,
        classifications,
        db=db,
        non_investable_account_ids=non_investable_account_ids(db),
    )
    targets = {t.path: float(t.pct) for t in db.query(Target).all()}
    result = apply_drift(
        result,
        targets,
        drift_tolerance_pct=settings.drift_tolerance_pct,
        drift_act_pct=settings.drift_act_pct,
        drift_urgent_pct=settings.drift_urgent_pct,
    )

    if not any("." not in p for p in targets):
        return RebalanceResult(
            mode=mode,
            total=result.total,
            contribution_usd=amount if mode == "new_money" else None,
            moves=[],
        )

    by_name = {s.name: s for s in result.by_asset_class}
    for ac, sl in by_name.items():
        prefix = f"{ac}."
        provided_p = {p for p in targets if p.startswith(prefix)}
        if not provided_p:
            continue
        required_p = {
            f"{ac}.{c.name}" for c in meaningful_children(sl) if c.value > 0
        }
        if provided_p != required_p:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "stale_targets",
                    "asset_class": ac,
                    "missing_paths": sorted(required_p - provided_p),
                    "extra_paths": sorted(provided_p - required_p),
                },
            )

    if mode == "new_money":
        if amount is None or not math.isfinite(amount) or amount <= 0:
            raise HTTPException(
                status_code=422,
                detail="amount must be a positive finite number for mode=new_money",
            )
        return compute_new_money(
            result,
            targets,
            amount,
            drift_tolerance_pct=settings.drift_tolerance_pct,
        )

    return compute_rebalance(
        result,
        targets,
        drift_tolerance_pct=settings.drift_tolerance_pct,
        drift_act_pct=settings.drift_act_pct,
    )
