"""Position commit pipeline (paste / extract → DB + classification writes)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.classifications import load_classifications
from app.constants import VALID_ASSET_CLASSES
from app.models import Account, Classification, Position, Provenance
from app.shared.schemas.accounts import MANUAL_ACCOUNT_TYPES
from app.shared.schemas.positions import CommitPosition, CommitResult, PositionCommit
from app.services.classification_rows import (
    replace_user_classification_buckets,
    single_bucket,
    yaml_asset_class_only_matches,
    yaml_matches_single_bucket,
)
from app.services.portfolio_snapshot import write_snapshot
from app.taxonomy import TAXONOMY, is_allowed_pair


def resolve_account(db: Session, account_id: int | None) -> Account:
    """Resolve target account; auto-seed Default brokerage when none exist."""
    if account_id is not None:
        account = db.get(Account, account_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"account {account_id} not found",
            )
        return account

    account = db.query(Account).order_by(Account.id).first()
    if account is None:
        account = Account(label="Default", type="brokerage")
        db.add(account)
        db.flush()
    return account


def resolve_ticker(db: Session, proposed: str) -> str:
    """Auto-suffix when a Classification row already exists for ``proposed``."""
    if db.get(Classification, proposed) is None:
        return proposed
    n = 2
    while db.get(Classification, f"{proposed}-{n}") is not None:
        n += 1
    return f"{proposed}-{n}"


def apply_commit_row_classification(
    db: Session,
    source: str,
    row: CommitPosition,
    now: datetime,
) -> str:
    """Resolve final ticker and apply classification writes."""
    ticker = row.ticker
    if row.classification is not None:
        cls_in = row.classification
        if cls_in.asset_class not in VALID_ASSET_CLASSES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"asset_class must be one of "
                    f"{sorted(VALID_ASSET_CLASSES)}; "
                    f"got {cls_in.asset_class!r}"
                ),
            )
        ac = cls_in.asset_class
        sc = cls_in.sub_class
        if sc is None:
            sc = TAXONOMY[ac][0]
        elif not is_allowed_pair(ac, sc):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"sub_class for {ac!r} must be one of {list(TAXONOMY[ac])}; "
                    f"got {cls_in.sub_class!r}"
                ),
            )
        commit_buckets = single_bucket(ac, sc)
        sc_conf = cls_in.suggestion_confidence
        sr = cls_in.suggestion_reasoning if sc_conf is not None else None
        pconf = float(sc_conf) if sc_conf is not None else 1.0
        if cls_in.auto_suffix:
            ticker = resolve_ticker(db, ticker)
            replace_user_classification_buckets(
                db,
                ticker,
                commit_buckets,
                source,
                now,
                provenance_confidence=pconf,
                provenance_llm_span=sr,
            )
        else:
            existing_c = db.get(Classification, ticker)
            yaml_entries = load_classifications()
            yaml_hit = yaml_entries.get(ticker)
            same_as_yaml = yaml_matches_single_bucket(
                yaml_hit, cls_in.asset_class, cls_in.sub_class
            ) or yaml_asset_class_only_matches(
                yaml_hit, cls_in.asset_class, cls_in.sub_class
            )
            if existing_c is not None:
                if existing_c.source == "user":
                    replace_user_classification_buckets(
                        db,
                        ticker,
                        commit_buckets,
                        source,
                        now,
                        provenance_confidence=pconf,
                        provenance_llm_span=sr,
                    )
            elif not same_as_yaml:
                replace_user_classification_buckets(
                    db,
                    ticker,
                    commit_buckets,
                    source,
                    now,
                    provenance_confidence=pconf,
                    provenance_llm_span=sr,
                )
    return ticker


def add_position_numeric_provenance(
    db: Session,
    position_id: int,
    source: str,
    confidence: float,
    source_span: str,
    now: datetime,
    shares: float,
    cost_basis: float | None,
    market_value: float | None,
) -> None:
    for field, value in (
        ("shares", shares),
        ("cost_basis", cost_basis),
        ("market_value", market_value),
    ):
        if value is None:
            continue
        db.add(
            Provenance(
                entity_type="position",
                entity_id=position_id,
                field=field,
                source=source,
                confidence=confidence,
                llm_span=source_span,
                captured_at=now,
            )
        )


def commit_positions(db: Session, body: PositionCommit) -> CommitResult:
    now = datetime.now(UTC)

    if body.account_id is not None:
        target_account = db.get(Account, body.account_id)
        if target_account is not None and target_account.type in MANUAL_ACCOUNT_TYPES:
            existing_count = (
                db.query(Position)
                .filter(Position.account_id == body.account_id)
                .count()
            )
            incoming_count = len(body.positions)
            if body.replace_account:
                result_count = incoming_count
            else:
                result_count = existing_count + incoming_count
            if result_count > 1:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"This account may only hold one position "
                        f"(currently has {existing_count}). "
                        f"Use replace_account=true to overwrite it."
                    ),
                )

    if body.replace_account:
        if body.account_id is None:
            raise HTTPException(
                status_code=422,
                detail="replace_account requires account_id",
            )
        if not body.positions:
            raise HTTPException(
                status_code=422,
                detail="replace_account requires at least one position",
            )
        account = db.get(Account, body.account_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"account {body.account_id} not found",
            )

        created_ids: list[int] = []
        final_tickers: list[str] = []
        for row in body.positions:
            ticker = apply_commit_row_classification(db, body.source, row, now)

            position = (
                db.query(Position)
                .filter(
                    Position.account_id == account.id,
                    func.upper(Position.ticker) == ticker.upper(),
                )
                .first()
            )
            if position is not None:
                old_shares = position.shares
                old_cb = position.cost_basis
                old_mv = position.market_value
                position.shares = row.shares
                position.cost_basis = row.cost_basis
                position.market_value = row.market_value
                position.as_of = now
                position.source = body.source
                for field, old_v, new_v in (
                    ("shares", old_shares, row.shares),
                    ("cost_basis", old_cb, row.cost_basis),
                    ("market_value", old_mv, row.market_value),
                ):
                    if new_v is None:
                        continue
                    if old_v != new_v:
                        db.add(
                            Provenance(
                                entity_type="position",
                                entity_id=position.id,
                                field=field,
                                source=body.source,
                                confidence=row.confidence,
                                llm_span=row.source_span,
                                captured_at=now,
                            )
                        )
                created_ids.append(position.id)
                final_tickers.append(ticker)
            else:
                position = Position(
                    account_id=account.id,
                    ticker=ticker,
                    shares=row.shares,
                    cost_basis=row.cost_basis,
                    market_value=row.market_value,
                    as_of=now,
                    source=body.source,
                )
                db.add(position)
                db.flush()
                add_position_numeric_provenance(
                    db,
                    position.id,
                    body.source,
                    row.confidence,
                    row.source_span,
                    now,
                    row.shares,
                    row.cost_basis,
                    row.market_value,
                )
                created_ids.append(position.id)
                final_tickers.append(ticker)

        committed_upper = {t.upper() for t in final_tickers}
        stale = [
            p
            for p in db.query(Position).filter_by(account_id=account.id).all()
            if p.ticker.upper() not in committed_upper
        ]
        for p in stale:
            db.delete(p)

        seen_ids: set[int] = set(created_ids)
        for p in db.query(Position).filter_by(account_id=account.id).all():
            if p.ticker.upper() in committed_upper and p.id not in seen_ids:
                db.delete(p)

        db.commit()
        write_snapshot(db)
        return CommitResult(
            account_id=account.id, position_ids=created_ids, tickers=final_tickers
        )

    account = resolve_account(db, body.account_id)

    created_ids: list[int] = []
    final_tickers: list[str] = []
    for row in body.positions:
        ticker = apply_commit_row_classification(db, body.source, row, now)

        position = (
            db.query(Position)
            .filter(
                Position.account_id == account.id,
                func.upper(Position.ticker) == ticker.upper(),
            )
            .first()
        )
        if position is not None:
            position.shares = row.shares
            position.cost_basis = row.cost_basis
            position.market_value = row.market_value
            position.as_of = now
            position.source = body.source
        else:
            position = Position(
                account_id=account.id,
                ticker=ticker,
                shares=row.shares,
                cost_basis=row.cost_basis,
                market_value=row.market_value,
                as_of=now,
                source=body.source,
            )
            db.add(position)
            db.flush()

        add_position_numeric_provenance(
            db,
            position.id,
            body.source,
            row.confidence,
            row.source_span,
            now,
            row.shares,
            row.cost_basis,
            row.market_value,
        )

        created_ids.append(position.id)
        final_tickers.append(ticker)

    db.commit()
    write_snapshot(db)

    return CommitResult(
        account_id=account.id, position_ids=created_ids, tickers=final_tickers
    )
