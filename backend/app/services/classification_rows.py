"""Classification row shaping and user bucket writes (shared across features)."""

from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy.orm import Session

from app.classifications import ClassificationEntry
from app.models import Classification, ClassificationBucket, Provenance
from app.shared.schemas.classifications import (
    ClassificationBucketPayload,
    ClassificationRow,
    HowClassified,
)

# Synthetic tickers for manual account types: map account.type → (L1, L2).
MANUAL_ACCOUNT_TYPE_TO_TAXONOMY: dict[str, tuple[str, str]] = {
    "real_estate": ("Real Estate", "Primary Residence"),
    "private": ("Private", "Private Equity"),
}


def slug(s: str) -> str:
    """Lowercase slug for synthetic asset tickers (real_estate / private).

    Replaces any run of non-alphanumeric chars (except . _ -) with a single
    dash, then strips leading/trailing dashes. Falls back to "item" if the
    result is empty (all-symbol label).
    """
    slug_out = re.sub(r"[^a-z0-9._-]+", "-", s.strip().lower()).strip("-")
    slug_out = re.sub(r"-{2,}", "-", slug_out)
    return slug_out or "item"


def classification_row_from_entry(
    ticker: str,
    entry: ClassificationEntry,
    *,
    overrides_yaml: bool = False,
    how_classified: HowClassified,
) -> ClassificationRow:
    payloads = [
        ClassificationBucketPayload(
            asset_class=b.asset_class, sub_class=b.sub_class, weight=b.weight
        )
        for b in entry.buckets
    ]
    return ClassificationRow(
        ticker=ticker,
        buckets=payloads,
        source=entry.source,
        overrides_yaml=overrides_yaml,
        has_breakdown=len(entry.buckets) > 1,
        how_classified=how_classified,
    )


def replace_user_classification_buckets(
    db: Session,
    ticker: str,
    buckets: list[ClassificationBucketPayload],
    provenance_source: str,
    now: datetime,
    *,
    provenance_confidence: float = 1.0,
    provenance_llm_span: str | None = None,
) -> Classification:
    row = db.get(Classification, ticker)
    if row is None:
        row = Classification(ticker=ticker, source="user")
        db.add(row)
        db.flush()
    else:
        row.source = "user"
    db.query(ClassificationBucket).filter(ClassificationBucket.ticker == ticker).delete(
        synchronize_session=False
    )
    for i, b in enumerate(buckets):
        db.add(
            ClassificationBucket(
                ticker=ticker,
                sort_order=i,
                asset_class=b.asset_class,
                sub_class=b.sub_class,
                weight=b.weight,
            )
        )
    db.add(
        Provenance(
            entity_type="classification",
            entity_id=0,
            entity_key=ticker,
            field="buckets",
            source=provenance_source,
            confidence=provenance_confidence,
            llm_span=provenance_llm_span,
            captured_at=now,
        )
    )
    return row


def single_bucket(
    asset_class: str, sub_class: str | None
) -> list[ClassificationBucketPayload]:
    return [
        ClassificationBucketPayload(
            asset_class=asset_class,
            sub_class=sub_class,
            weight=1.0,
        )
    ]


def yaml_matches_single_bucket(
    yaml_entry: ClassificationEntry | None,
    asset_class: str,
    sub_class: str | None,
) -> bool:
    if yaml_entry is None or len(yaml_entry.buckets) != 1:
        return False
    yb = yaml_entry.buckets[0]
    return yb.asset_class == asset_class and (yb.sub_class or None) == (sub_class or None)


def yaml_asset_class_only_matches(
    yaml_entry: ClassificationEntry | None,
    asset_class: str,
    sub_class: str | None,
) -> bool:
    """Paste/LLM often sends only asset_class. Skip a redundant user row when every
    seed bucket is already that asset class (e.g. VTI = all equity buckets).
    """
    if yaml_entry is None or sub_class is not None:
        return False
    if not yaml_entry.buckets:
        return False
    return all(b.asset_class == asset_class for b in yaml_entry.buckets)
