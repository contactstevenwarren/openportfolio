"""Classification taxonomy, suggest, list, patch, delete."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.classifications import (
    ClassificationEntry,
    load_classifications,
    load_user_classifications,
    primary_asset_class,
)
from app.constants import VALID_ASSET_CLASSES
from app.models import Classification, Position, Provenance
from .schemas import (
    ClassificationPatch,
    ClassificationRow,
    ClassificationSuggestItem,
    ClassificationSuggestRequest,
    Taxonomy,
    TaxonomyOption,
)
from app.services.classification_rows import (
    classification_row_from_entry,
    replace_user_classification_buckets,
)
from app.taxonomy import TAXONOMY, is_allowed_pair, taxonomy_options_for_api
from app.shared.schemas.classifications import HowClassified


def _latest_buckets_provenance(db: Session, ticker: str) -> Provenance | None:
    return (
        db.query(Provenance)
        .filter(Provenance.entity_type == "classification")
        .filter(Provenance.entity_key == ticker)
        .filter(Provenance.field == "buckets")
        .order_by(desc(Provenance.captured_at), desc(Provenance.id))
        .first()
    )


def _how_classified_from_provenance(p: Provenance | None) -> HowClassified:
    if p is None:
        return "unknown"
    src = (p.source or "").strip()
    if src == "user":
        return "classifications_ui"
    if src == "manual":
        return "accounts_manual"
    if src.startswith("paste") or src.startswith("pdf"):
        if (p.llm_span or "").strip():
            return "import_llm"
        return "import_manual"
    return "unknown"


def taxonomy_from_locked() -> Taxonomy:
    ac_rows, subs_map = taxonomy_options_for_api()
    return Taxonomy(
        asset_classes=[TaxonomyOption(value=v, label=l) for v, l in ac_rows],
        sub_classes_by_class={
            ac: [TaxonomyOption(value=v, label=l) for v, l in opts]
            for ac, opts in subs_map.items()
        },
    )


def suggest_classifications(
    db: Session, body: ClassificationSuggestRequest
) -> list[ClassificationSuggestItem]:
    from app.llm import classify_ticker

    yaml_entries = load_classifications()
    user_entries = load_user_classifications(db)
    merged: dict[str, ClassificationEntry] = {**yaml_entries, **user_entries}
    # Case-insensitive lookup so "vt" matches the YAML key "VT".
    by_upper: dict[str, tuple[str, ClassificationEntry]] = {
        t.upper(): (t, e) for t, e in merged.items()
    }
    seen: set[str] = set()
    out: list[ClassificationSuggestItem] = []
    for raw in body.tickers:
        ticker = raw.strip()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        hit = by_upper.get(ticker.upper())
        if hit is not None:
            canonical_ticker, ent = hit
            if not ent.buckets:
                out.append(ClassificationSuggestItem(ticker=canonical_ticker, source="none"))
                continue
            dominant = max(ent.buckets, key=lambda b: b.weight)
            out.append(
                ClassificationSuggestItem(
                    ticker=canonical_ticker,
                    source="existing",
                    asset_class=primary_asset_class(ent),
                    sub_class=dominant.sub_class,
                )
            )
            continue
        res = classify_ticker(ticker)
        if res is None:
            out.append(ClassificationSuggestItem(ticker=ticker, source="none"))
        else:
            out.append(
                ClassificationSuggestItem(
                    ticker=ticker,
                    source="llm",
                    asset_class=res.asset_class,
                    confidence=res.confidence,
                    reasoning=res.reasoning,
                )
            )
    return out


def list_classifications(db: Session) -> list[ClassificationRow]:
    yaml_entries = load_classifications()
    user_rows = {c.ticker: c for c in db.query(Classification).all()}
    user_entries_full = load_user_classifications(db)
    merged: list[ClassificationRow] = []
    for ticker, entry in yaml_entries.items():
        # Suppress YAML only when the user has a real bucketed override. A header-only
        # Classification row (no buckets) must not hide the seed row — see list test.
        user_ent = user_entries_full.get(ticker)
        if user_ent is not None:
            continue
        merged.append(
            classification_row_from_entry(
                ticker, entry, overrides_yaml=False, how_classified="built_in"
            )
        )
    for ticker, row in user_rows.items():
        user_ent = user_entries_full.get(ticker)
        if user_ent is None:
            continue
        how = _how_classified_from_provenance(_latest_buckets_provenance(db, ticker))
        merged.append(
            classification_row_from_entry(
                ticker,
                user_ent,
                overrides_yaml=ticker in yaml_entries,
                how_classified=how,
            )
        )
    merged.sort(key=lambda r: r.ticker)
    return merged


def patch_classification(
    db: Session, ticker: str, body: ClassificationPatch
) -> ClassificationRow:
    for b in body.buckets:
        if b.asset_class not in VALID_ASSET_CLASSES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"asset_class must be one of "
                    f"{sorted(VALID_ASSET_CLASSES)}; got {b.asset_class!r}"
                ),
            )
        if b.sub_class is None or not is_allowed_pair(b.asset_class, b.sub_class):
            allowed = list(TAXONOMY.get(b.asset_class, ()))
            raise HTTPException(
                status_code=422,
                detail=(
                    f"sub_class for asset_class={b.asset_class!r} must be one of "
                    f"{allowed}; got {b.sub_class!r}"
                ),
            )

    now = datetime.now(UTC)
    replace_user_classification_buckets(db, ticker, list(body.buckets), "user", now)
    db.commit()

    yaml_entries = load_classifications()
    user_ent = load_user_classifications(db)[ticker]
    return classification_row_from_entry(
        ticker,
        user_ent,
        overrides_yaml=ticker in yaml_entries,
        how_classified="classifications_ui",
    )


def delete_classification(db: Session, ticker: str) -> None:
    existing = db.get(Classification, ticker)
    if existing is None:
        return

    yaml_entries = load_classifications()
    has_yaml_fallback = ticker in yaml_entries

    if not has_yaml_fallback:
        position_count = (
            db.query(Position).filter(Position.ticker == ticker).count()
        )
        if position_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"{position_count} position(s) reference {ticker!r}; "
                    "delete or reclassify them first."
                ),
            )

    db.delete(existing)
    db.commit()
