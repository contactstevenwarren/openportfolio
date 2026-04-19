"""YAML + user-override ticker classifications (docs/architecture.md classification and look-through).

YAML is the baseline source of truth. DB rows in the ``classifications``
table with ``source='user'`` override the YAML at aggregation time --
see ``load_user_classifications`` below. ``classify()`` is pure
dict-lookup against the merged YAML + user dict; the v0.1 "synthetic
prefix" convention is gone as of v0.1.5 M4. Existing
``PREFIX:suffix`` positions are migrated to per-ticker user rows on
startup via ``migrate_synthetic_positions``.

The ``source`` carried on each ``ClassificationEntry`` is surfaced on
the allocation response so the sunburst hover can show "classified as:
us_tips (your override)".
"""

from dataclasses import dataclass
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PATH = REPO_ROOT / "data" / "classifications.yaml"


@dataclass(frozen=True)
class ClassificationEntry:
    ticker: str
    asset_class: str
    sub_class: str | None = None
    sector: str | None = None
    region: str | None = None
    # "yaml" = bundled baseline, "user" = DB override, "prefix" = synthetic
    # fallback from _SYNTHETIC_PREFIXES. The allocation endpoint exposes
    # this per ticker so the sunburst hover can show provenance for the
    # classification routing (not just the position's numbers).
    source: str = "yaml"


# Legacy prefix→classification table used ONLY by
# ``migrate_synthetic_positions`` to convert existing v0.1 synthetic
# ticker positions (e.g. ``REALESTATE:house``) into per-ticker
# Classification rows at startup. Not consulted by ``classify()`` --
# v0.1.5 M4 moved classification routing entirely onto the YAML +
# Classification table. Delete this dict once all known installs have
# run the migration at least once (roadmap v1.0 hardening).
_LEGACY_SYNTHETIC_PREFIXES: dict[str, ClassificationEntry] = {
    "REALESTATE": ClassificationEntry(
        ticker="REALESTATE",
        asset_class="real_estate",
        sub_class="direct",
        sector="real_estate",
        region="US",
    ),
    "GOLD": ClassificationEntry(
        ticker="GOLD",
        asset_class="commodity",
        sub_class="gold",
    ),
    "SILVER": ClassificationEntry(
        ticker="SILVER",
        asset_class="commodity",
        sub_class="silver",
    ),
    "CRYPTO": ClassificationEntry(
        ticker="CRYPTO",
        asset_class="crypto",
        sub_class="other",
    ),
    "PRIVATE": ClassificationEntry(
        ticker="PRIVATE",
        asset_class="private",
        sub_class="equity",
    ),
    "HSA_CASH": ClassificationEntry(
        ticker="HSA_CASH",
        asset_class="cash",
        sub_class="hsa_cash",
    ),
    # Generic cash pool for checking / savings / brokerage sweep cash that
    # isn't tied to an HSA (e.g. ``CASH:ally``, ``CASH:wf-checking``).
    "CASH": ClassificationEntry(
        ticker="CASH",
        asset_class="cash",
        sub_class="cash",
    ),
    # Directly-held Treasury notes / bills (brokerage shows the CUSIP, not
    # an ETF ticker). ``TREASURY:91282CKE0`` is the natural encoding.
    "TREASURY": ClassificationEntry(
        ticker="TREASURY",
        asset_class="fixed_income",
        sub_class="us_treasury",
        region="US",
    ),
    # Treasury Inflation-Protected Securities held directly (TreasuryDirect).
    "TIPS": ClassificationEntry(
        ticker="TIPS",
        asset_class="fixed_income",
        sub_class="us_tips",
        region="US",
    ),
    # FDIC-insured CDs held inside a brokerage (Schwab, Vanguard, etc.).
    # Treated as cash-equivalent for the 5-number summary.
    "CD": ClassificationEntry(
        ticker="CD",
        asset_class="cash",
        sub_class="cd",
    ),
    # Employer stock held through an ESPP / RSU grant. Classified as a
    # generic US large-cap equity; user can override via /positions if
    # the employer is small/mid/foreign.
    "ESPP": ClassificationEntry(
        ticker="ESPP",
        asset_class="equity",
        sub_class="us_large_cap",
        sector="diversified",
        region="US",
    ),
}


def load_classifications(path: Path = DEFAULT_PATH) -> dict[str, ClassificationEntry]:
    with path.open() as f:
        raw = yaml.safe_load(f)
    if not isinstance(raw, dict):
        raise ValueError(f"classifications YAML must be a top-level mapping: {path}")

    entries: dict[str, ClassificationEntry] = {}
    for ticker, attrs in raw.items():
        if not isinstance(attrs, dict) or not attrs.get("asset_class"):
            raise ValueError(f"ticker {ticker!r} missing required asset_class")
        entries[ticker] = ClassificationEntry(
            ticker=ticker,
            asset_class=attrs["asset_class"],
            sub_class=attrs.get("sub_class"),
            sector=attrs.get("sector"),
            region=attrs.get("region"),
            source="yaml",
        )
    return entries


def load_user_classifications(db: Session) -> dict[str, ClassificationEntry]:
    """Pull every row from the ``classifications`` DB table.

    Every row has ``source='user'`` in v0.1.5 (either explicit user
    edits via /classifications or the one-shot migration of synthetic
    prefix positions). Caller merges this dict over the YAML baseline
    so user rows win.
    """
    from .models import Classification as DbClassification

    rows = db.query(DbClassification).all()
    return {
        r.ticker: ClassificationEntry(
            ticker=r.ticker,
            asset_class=r.asset_class,
            sub_class=r.sub_class,
            sector=r.sector,
            region=r.region,
            source=r.source,
        )
        for r in rows
    }


def migrate_synthetic_positions(db: Session) -> int:
    """One-shot: turn every existing ``PREFIX:suffix`` position into a
    user Classification row, then the prefix fallback can disappear.

    Idempotent -- rows that already have a Classification are skipped,
    so it's safe to call on every startup. Returns the count of new
    Classification rows created (handy for logs and tests).

    Runs at startup because v0.1.5 drops the prefix-based fallback in
    ``classify()``; without this migration, existing synthetic-ticker
    positions (e.g. ``REALESTATE:house``) would become unclassified
    after the upgrade.
    """
    from .models import Classification as DbClassification
    from .models import Position

    created = 0
    seen: set[str] = set()
    positions = db.query(Position).filter(Position.ticker.contains(":")).all()
    for p in positions:
        if p.ticker in seen:
            continue
        seen.add(p.ticker)
        if db.get(DbClassification, p.ticker) is not None:
            continue
        prefix = p.ticker.split(":", 1)[0].upper()
        legacy = _LEGACY_SYNTHETIC_PREFIXES.get(prefix)
        if legacy is None:
            continue  # unknown prefix -> let aggregation flag it unclassified
        db.add(
            DbClassification(
                ticker=p.ticker,
                asset_class=legacy.asset_class,
                sub_class=legacy.sub_class,
                sector=legacy.sector,
                region=legacy.region,
                source="user",
            )
        )
        created += 1
    if created:
        db.commit()
    return created


def classify(
    ticker: str, entries: dict[str, ClassificationEntry]
) -> ClassificationEntry | None:
    """Resolve a ticker to a ClassificationEntry.

    v0.1.5 model: exact match against the merged YAML + user DB dict.
    Synthetic prefix fallback is gone (``migrate_synthetic_positions``
    at startup converts existing ``PREFIX:suffix`` positions into
    per-ticker user rows so their ticker is now a direct lookup hit).
    """
    return entries.get(ticker)
