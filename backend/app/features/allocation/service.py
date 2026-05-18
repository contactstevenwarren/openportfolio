"""Portfolio allocation and per-position slice breakdown."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.allocation import aggregate, meaningful_children, positions_for_slice
from app.classifications import load_classifications, load_user_classifications
from app.config import settings
from app.constants import VALID_ASSET_CLASSES
from app.drift import apply_drift
from app.models import Account, Position, Target
from app.shared.schemas.allocation import (
    AllocationResult,
    DriftThresholds,
    PositionContribution,
    PositionContributionsResponse,
)
from app.services.portfolio_snapshot import (
    archived_account_ids,
    liabilities_total,
    non_investable_account_ids,
)


def get_allocation(db: Session) -> AllocationResult:
    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    non_inv = non_investable_account_ids(db)
    arch = archived_account_ids(db)
    result = aggregate(
        positions,
        classifications,
        db=db,
        non_investable_account_ids=non_inv,
        archived_account_ids=arch,
    )
    liabilities = liabilities_total(db)
    result = result.model_copy(
        update={
            "liabilities_total": liabilities,
            "net_worth": result.assets_total - liabilities,
        },
        deep=False,
    )
    targets = {t.path: float(t.pct) for t in db.query(Target).all()}
    result = apply_drift(
        result,
        targets,
        drift_tolerance_pct=settings.drift_tolerance_pct,
        drift_act_pct=settings.drift_act_pct,
        drift_urgent_pct=settings.drift_urgent_pct,
    )
    return result.model_copy(
        update={
            "drift_thresholds": DriftThresholds(
                tolerance_pct=int(settings.drift_tolerance_pct),
                act_pct=int(settings.drift_act_pct),
                urgent_pct=int(settings.drift_urgent_pct),
            ),
        },
        deep=False,
    )


def get_allocation_positions(
    db: Session, asset_class: str, l2: str | None
) -> PositionContributionsResponse:
    if asset_class not in VALID_ASSET_CLASSES:
        raise HTTPException(status_code=404, detail=f"Unknown asset class: {asset_class!r}")

    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    non_investable_ids = non_investable_account_ids(db)
    archived_ids = archived_account_ids(db)

    if l2 is not None:
        result = aggregate(
            positions,
            classifications,
            db=db,
            non_investable_account_ids=non_investable_ids,
            archived_account_ids=archived_ids,
        )
        slice_obj = next((s for s in result.by_asset_class if s.name == asset_class), None)
        if slice_obj is None:
            raise HTTPException(
                status_code=400, detail=f"No data for asset class {asset_class!r}"
            )
        valid_l2 = {s.name for s in meaningful_children(slice_obj)}
        if l2 not in valid_l2:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown L2 segment {l2!r} for {asset_class!r}. Valid: {sorted(valid_l2)}",
            )
        portfolio_total = result.total
    else:
        result = aggregate(
            positions,
            classifications,
            db=db,
            non_investable_account_ids=non_investable_ids,
            archived_account_ids=archived_ids,
        )
        portfolio_total = result.total

    accounts = db.query(Account).all()
    account_names = {a.id: a.label for a in accounts}

    sr = positions_for_slice(
        positions,
        classifications,
        asset_class=asset_class,
        l2=l2,
        db=db,
        non_investable_account_ids=non_investable_ids,
        archived_account_ids=archived_ids,
        account_names=account_names,
        portfolio_total=portfolio_total,
    )

    return PositionContributionsResponse(
        asset_class=asset_class,
        l2=l2,
        total=sr.total,
        positions=[
            PositionContribution(
                ticker=p.ticker,
                account_id=p.account_id,
                account_name=p.account_name,
                contributing_value=p.contributing_value,
                share_of_slice=p.share_of_slice,
                share_of_portfolio=p.share_of_portfolio,
                is_partial=p.is_partial,
                classification_source=p.classification_source,
            )
            for p in sr.positions
        ],
        source_counts=sr.source_counts,
        unclassified_count=sr.unclassified_count,
    )
