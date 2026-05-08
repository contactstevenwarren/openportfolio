"""YAML classifications + user-override ticker classifications (bucket model).

``data/classifications.yaml`` holds per-ticker rows: either a flat
``asset_class`` / ``sub_class`` or a weighted ``buckets`` list for
multi-slice funds. DB rows in ``classifications`` +
``classification_buckets`` override the YAML for matching tickers
(``source='user'``).

``classify()`` resolves merged YAML + user dict. Synthetic ``PREFIX:suffix``
tickers must have an explicit YAML or user classification row (no prefix
fallback).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from .taxonomy import TAXONOMY, assert_valid_buckets, merge_canonical_bucket_rows

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PATH = REPO_ROOT / "data" / "classifications.yaml"


@dataclass(frozen=True)
class BucketEntry:
    asset_class: str
    sub_class: str | None
    weight: float


@dataclass(frozen=True)
class ClassificationEntry:
    ticker: str
    buckets: tuple[BucketEntry, ...]
    # "yaml" = bundled baseline, "user" = DB override
    source: str = "yaml"

    @staticmethod
    def from_flat(
        ticker: str,
        *,
        asset_class: str,
        sub_class: str | None = None,
        source: str = "yaml",
    ) -> ClassificationEntry:
        """Build a single 100% bucket (tests + API)."""
        if sub_class is None or (isinstance(sub_class, str) and not str(sub_class).strip()):
            if asset_class not in TAXONOMY:
                raise ValueError(f"unknown asset_class {asset_class!r}")
            sc = TAXONOMY[asset_class][0]
        else:
            sc = sub_class
        merged = merge_canonical_bucket_rows([(asset_class, sc, 1.0)])
        return ClassificationEntry(
            ticker=ticker,
            buckets=tuple(BucketEntry(a, s, w) for a, s, w in merged),
            source=source,
        )


def _entry_buckets(attrs: dict, ticker: str) -> tuple[BucketEntry, ...]:
    """Parse flat row, explicit ``buckets`` list, or raise."""
    if isinstance(attrs.get("buckets"), list):
        blist = attrs["buckets"]
        if not blist:
            raise ValueError(f"{ticker!r}: buckets list is empty")
        out: list[BucketEntry] = []
        for i, b in enumerate(blist):
            if not isinstance(b, dict):
                raise ValueError(f"{ticker!r}: bucket {i} must be a mapping")
            ac = b.get("asset_class")
            if not ac or not isinstance(ac, str):
                raise ValueError(f"{ticker!r}: bucket {i} needs asset_class string")
            sc = b.get("sub_class")
            if sc is not None and not isinstance(sc, str):
                raise ValueError(f"{ticker!r}: bucket {i} sub_class must be string or null")
            w = b.get("weight")
            if w is None:
                raise ValueError(f"{ticker!r}: bucket {i} needs weight")
            wf = float(w)
            if wf < 0 or wf > 1.0 + 1e-6:
                raise ValueError(f"{ticker!r}: bucket {i} weight out of range")
            out.append(BucketEntry(asset_class=ac, sub_class=sc, weight=wf))
        s = sum(x.weight for x in out)
        if s <= 0:
            raise ValueError(f"{ticker!r}: bucket weights must sum to a positive value")
        prelim = tuple(
            BucketEntry(b.asset_class, b.sub_class, b.weight / s) for b in out
        )
        merged = merge_canonical_bucket_rows(
            [(b.asset_class, b.sub_class, b.weight) for b in prelim],
        )
        assert_valid_buckets(merged)
        return tuple(BucketEntry(a, s, w) for a, s, w in merged)

    ac = str(attrs.get("asset_class") or "")
    if not ac:
        raise ValueError(f"{ticker!r}: missing asset_class (or non-empty buckets)")
    sc = attrs.get("sub_class")
    if sc is None or (isinstance(sc, str) and not str(sc).strip()):
        if ac not in TAXONOMY:
            raise ValueError(f"{ticker!r}: unknown asset_class {ac!r}")
        sc_use = TAXONOMY[ac][0]
    else:
        sc_use = str(sc).strip()
    merged = merge_canonical_bucket_rows([(ac, sc_use, 1.0)])
    return tuple(BucketEntry(a, s, w) for a, s, w in merged)


def load_classifications(path: Path = DEFAULT_PATH) -> dict[str, ClassificationEntry]:
    with path.open() as f:
        raw = yaml.safe_load(f)
    if not isinstance(raw, dict):
        raise ValueError(f"classifications YAML must be a top-level mapping: {path}")

    entries: dict[str, ClassificationEntry] = {}
    for ticker, attrs in raw.items():
        if not isinstance(ticker, str) or ticker.startswith("#"):
            continue
        if not isinstance(attrs, dict):
            continue
        entries[ticker] = ClassificationEntry(
            ticker=ticker,
            buckets=_entry_buckets(attrs, ticker),
            source="yaml",
        )
    return entries


def load_user_classifications(db: Session) -> dict[str, ClassificationEntry]:
    from sqlalchemy.orm import selectinload

    from .models import Classification as DbClassification

    rows = (
        db.query(DbClassification)
        .options(selectinload(DbClassification.buckets))
        .all()
    )
    out: dict[str, ClassificationEntry] = {}
    for r in rows:
        if not r.buckets:
            continue
        btuple = tuple(
            BucketEntry(b.asset_class, b.sub_class, b.weight)
            for b in sorted(r.buckets, key=lambda x: x.sort_order)
        )
        s = sum(b.weight for b in btuple)
        if s <= 0:
            continue
        norm = tuple(
            BucketEntry(b.asset_class, b.sub_class, b.weight / s) for b in btuple
        )
        merged = merge_canonical_bucket_rows(
            [(b.asset_class, b.sub_class, b.weight) for b in norm],
        )
        out[r.ticker] = ClassificationEntry(
            ticker=r.ticker,
            buckets=tuple(BucketEntry(a, sc, w) for a, sc, w in merged),
            source=r.source,
        )
    return out


def primary_asset_class(entry: ClassificationEntry) -> str:
    """Dominant asset_class for account summaries and zero-value fallbacks."""
    if len(entry.buckets) == 1:
        return entry.buckets[0].asset_class
    return max(entry.buckets, key=lambda b: b.weight).asset_class


def classify(
    ticker: str, entries: dict[str, ClassificationEntry]
) -> ClassificationEntry | None:
    """Resolve a ticker to a ClassificationEntry (exact match)."""
    return entries.get(ticker)
