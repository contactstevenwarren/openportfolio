"""Account CRUD and enriched reads."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.allocation import aggregate
from app.classifications import load_classifications, load_user_classifications
from app.models import Account, Classification, Institution, Position
from .schemas import (
    TAX_TREATMENTS_BROKERAGE_ONLY,
    VALID_TAX_TREATMENTS,
    MANUAL_ACCOUNT_TYPES,
    AccountClassBreakdown,
    AccountCreate,
    AccountPatch,
    AccountRead,
)
from app.services.classification_rows import (
    MANUAL_ACCOUNT_TYPE_TO_TAXONOMY,
    replace_user_classification_buckets,
    single_bucket,
    slug,
)
from app.services.portfolio_snapshot import write_snapshot


def validate_tax_treatment(account_type: str, tax_treatment: str) -> None:
    if tax_treatment not in VALID_TAX_TREATMENTS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"tax_treatment must be one of {sorted(VALID_TAX_TREATMENTS)}; "
                f"got {tax_treatment!r}"
            ),
        )
    if tax_treatment in TAX_TREATMENTS_BROKERAGE_ONLY and account_type != "brokerage":
        raise HTTPException(
            status_code=422,
            detail=(
                f"tax_treatment {tax_treatment!r} is only valid for type='brokerage'; "
                f"got type={account_type!r}"
            ),
        )


def enrich_account(
    account: Account,
    classifications: dict,
    db: Session,
) -> AccountRead:
    positions = account.positions

    balance = round(
        sum(
            p.market_value if p.market_value is not None
            else (p.cost_basis if p.cost_basis is not None else 0.0)
            for p in positions
        ),
        2,
    )

    last_updated_at: str | None = None
    last_update_source: str | None = None
    if positions:
        latest = max(positions, key=lambda p: (p.as_of, p.id))
        last_updated_at = latest.as_of.isoformat()
        last_update_source = latest.source

    position_count = len(positions)

    classified_position_count = sum(
        1 for p in positions if p.ticker in classifications
    )

    class_breakdown: list[AccountClassBreakdown] = []
    if positions:
        result = aggregate(positions, classifications, db=db)
        class_breakdown = [
            AccountClassBreakdown(asset_class=s.name, value=round(s.value, 2))
            for s in result.by_asset_class
            if s.value > 0
        ]

    institution_name: str | None = None
    if account.institution_id is not None:
        inst = db.get(Institution, account.institution_id)
        institution_name = inst.name if inst else None

    is_manual = account.type in MANUAL_ACCOUNT_TYPES
    staleness_threshold_days = account.staleness_threshold_days

    return AccountRead(
        id=account.id,
        label=account.label,
        type=account.type,
        currency=account.currency,
        institution_id=account.institution_id,
        institution_name=institution_name,
        tax_treatment=account.tax_treatment,
        balance=balance,
        last_updated_at=last_updated_at,
        last_update_source=last_update_source,
        position_count=position_count,
        classified_position_count=classified_position_count,
        class_breakdown=class_breakdown,
        is_manual=is_manual,
        is_archived=account.is_archived,
        staleness_threshold_days=staleness_threshold_days,
        is_investable=account.is_investable,
    )


def list_accounts(db: Session) -> list[AccountRead]:
    accounts = db.query(Account).order_by(Account.id).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    return [enrich_account(a, classifications, db) for a in accounts]


def create_account(db: Session, body: AccountCreate) -> AccountRead:
    validate_tax_treatment(body.type, body.tax_treatment)
    account = Account(
        label=body.label,
        type=body.type,
        institution_id=body.institution_id,
        tax_treatment=body.tax_treatment,
        staleness_threshold_days=body.staleness_threshold_days,
    )
    db.add(account)
    db.flush()

    if body.type in MANUAL_ACCOUNT_TYPES and body.initial_position is not None:
        ip = body.initial_position
        base_ticker = slug(body.label)
        ticker = base_ticker
        n = 2
        while db.query(Position).filter(Position.ticker == ticker).first() is not None:
            if n > 1000:
                raise HTTPException(500, "ticker namespace exhausted")
            ticker = f"{base_ticker}-{n}"
            n += 1

        if ip.purchase_date is not None:
            as_of = datetime(
                ip.purchase_date.year,
                ip.purchase_date.month,
                ip.purchase_date.day,
                tzinfo=UTC,
            )
        else:
            as_of = datetime.now(UTC)

        position = Position(
            account_id=account.id,
            ticker=ticker,
            shares=1.0,
            market_value=ip.market_value,
            cost_basis=ip.cost_basis,
            as_of=as_of,
            source="manual",
            investable=True,
        )
        db.add(position)

        existing_cls = db.get(Classification, ticker)
        now = datetime.now(UTC)
        l1, l2 = MANUAL_ACCOUNT_TYPE_TO_TAXONOMY[body.type]
        manual_buckets = single_bucket(l1, l2)
        if existing_cls is None:
            replace_user_classification_buckets(db, ticker, manual_buckets, "manual", now)
        elif existing_cls.source == "user":
            replace_user_classification_buckets(db, ticker, manual_buckets, "manual", now)

    db.commit()
    db.refresh(account)
    classifications = {**load_classifications(), **load_user_classifications(db)}
    return enrich_account(account, classifications, db)


def patch_account(db: Session, account_id: int, body: AccountPatch) -> AccountRead:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    old_archived = account.is_archived
    old_investable = account.is_investable
    patch_fields = body.model_dump(exclude_unset=True)
    for field, value in patch_fields.items():
        setattr(account, field, value)
    validate_tax_treatment(account.type, account.tax_treatment)
    db.commit()
    db.refresh(account)
    if (account.is_archived, account.is_investable) != (old_archived, old_investable):
        write_snapshot(db)
    classifications = {**load_classifications(), **load_user_classifications(db)}
    return enrich_account(account, classifications, db)


def delete_account(db: Session, account_id: int) -> None:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    synthetic_tickers: list[str] = []
    if account.type in MANUAL_ACCOUNT_TYPES:
        synthetic_tickers = [p.ticker for p in account.positions]

    db.delete(account)
    db.flush()

    for ticker in synthetic_tickers:
        remaining = db.query(Position).filter(Position.ticker == ticker).count()
        if remaining == 0:
            cls_row = db.get(Classification, ticker)
            if cls_row is not None and cls_row.source == "user":
                db.delete(cls_row)

    db.commit()
