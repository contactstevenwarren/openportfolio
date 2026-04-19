"""Unit tests for the classifications YAML loader + v0.1.5 M4 migration.

Locks the 10-ticker seed set for M2 and the shape of each entry; later
phases are additive. Also covers ``migrate_synthetic_positions`` which
converts legacy ``PREFIX:suffix`` positions to per-ticker Classification
rows so the v0.1 prefix fallback can be deleted.
"""

from datetime import UTC, datetime
from pathlib import Path

import pytest
import yaml
from sqlalchemy.orm import Session

from app.classifications import (
    DEFAULT_PATH,
    ClassificationEntry,
    classify,
    load_classifications,
    migrate_synthetic_positions,
)
from app.models import Account, Classification, Position

EXPECTED_SEED = {"VTI", "VXUS", "BND", "VNQ", "GLD", "BTC", "SPY", "QQQ", "AAPL", "CASH"}
VALID_ASSET_CLASSES = {
    "equity",
    "fixed_income",
    "real_estate",
    "commodity",
    "crypto",
    "cash",
    "private",
}


def test_default_yaml_file_exists() -> None:
    assert DEFAULT_PATH.exists(), f"classifications YAML missing at {DEFAULT_PATH}"


def test_all_seed_tickers_present() -> None:
    entries = load_classifications()
    assert EXPECTED_SEED.issubset(entries.keys())


def test_every_entry_has_valid_asset_class() -> None:
    entries = load_classifications()
    for ticker, entry in entries.items():
        assert entry.asset_class in VALID_ASSET_CLASSES, (
            f"{ticker} has unknown asset_class {entry.asset_class!r}"
        )


def test_cash_classified_as_cash() -> None:
    entries = load_classifications()
    assert entries["CASH"].asset_class == "cash"


def test_us_equity_tickers_have_us_region() -> None:
    entries = load_classifications()
    for ticker in ("VTI", "SPY", "QQQ", "AAPL"):
        assert entries[ticker].region == "US", f"{ticker} region != US"


def test_entry_type_is_frozen_dataclass() -> None:
    entry = load_classifications()["VTI"]
    assert isinstance(entry, ClassificationEntry)
    with pytest.raises(Exception):
        entry.asset_class = "mutated"  # type: ignore[misc]


def test_missing_asset_class_raises(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text(yaml.safe_dump({"FOO": {"sub_class": "x"}}))
    with pytest.raises(ValueError, match="asset_class"):
        load_classifications(bad)


def test_non_mapping_top_level_raises(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text(yaml.safe_dump(["VTI", "VXUS"]))
    with pytest.raises(ValueError, match="top-level mapping"):
        load_classifications(bad)


def test_seed_expanded_to_maintainer_holdings() -> None:
    # M3 growth: real individual stocks + more ETFs + cash-equivalents.
    # M5 acceptance pass: Schwab Fundamental family + SWPPX/SWAGX/SWISX
    # mutual funds + VT + money markets + target-date VFIFX.
    entries = load_classifications()
    for t in (
        "MSFT", "NVDA", "BRK.B", "VOO", "SCHD", "BNDX", "SPAXX",
        "VT", "SWPPX", "SWAGX", "SWISX", "SNSXX", "BIL", "VFIFX",
        "CMF", "FNDX", "FNDE", "FNDA", "FNDF", "FNDC", "SCHE", "SCHC",
        "SCHA", "SCHG", "SCHH", "PXF", "PRF", "PRFZ", "IJH", "IJR",
        "IXUS", "USRT", "HAUZ", "EBND", "ADA", "ICP",
    ):
        assert t in entries, f"expected {t} in classifications YAML"


# ---- classify() (pure dict lookup in v0.1.5) ----------------------------


def test_classify_exact_match_wins() -> None:
    entries = load_classifications()
    entry = classify("VTI", entries)
    assert entry is not None
    assert entry.asset_class == "equity"


def test_classify_unknown_returns_none() -> None:
    entries = load_classifications()
    assert classify("ZZZZZ", entries) is None


def test_classify_no_longer_splits_on_colon() -> None:
    # v0.1.5 M4 removed the synthetic-prefix fallback. A PREFIX:suffix
    # ticker is just a plain ticker now; classification must come from
    # YAML or a user DB row (or be None = unclassified).
    assert classify("REALESTATE:123Main", {}) is None


# ---- migrate_synthetic_positions (v0.1.5 M4 one-shot) -------------------


def _seed_position(db: Session, ticker: str) -> None:
    account = db.query(Account).first()
    if account is None:
        account = Account(label="Test", type="brokerage")
        db.add(account)
        db.commit()
    db.add(
        Position(
            account_id=account.id,
            ticker=ticker,
            shares=1.0,
            market_value=1000.0,
            as_of=datetime.now(UTC),
            source="paste",
        )
    )
    db.commit()


def test_migration_converts_synthetic_positions(test_db: Session) -> None:
    _seed_position(test_db, "REALESTATE:123Main")
    _seed_position(test_db, "GOLD:bar-1")
    _seed_position(test_db, "CRYPTO:solana")

    created = migrate_synthetic_positions(test_db)
    assert created == 3

    house = test_db.get(Classification, "REALESTATE:123Main")
    assert house is not None
    assert house.asset_class == "real_estate"
    assert house.source == "user"

    gold = test_db.get(Classification, "GOLD:bar-1")
    assert gold is not None
    assert gold.sub_class == "gold"


def test_migration_is_idempotent(test_db: Session) -> None:
    _seed_position(test_db, "CASH:ally")
    assert migrate_synthetic_positions(test_db) == 1
    # Second run finds the row, skips it.
    assert migrate_synthetic_positions(test_db) == 0


def test_migration_ignores_plain_tickers(test_db: Session) -> None:
    _seed_position(test_db, "VTI")
    _seed_position(test_db, "BND")
    assert migrate_synthetic_positions(test_db) == 0
    assert test_db.get(Classification, "VTI") is None


def test_migration_ignores_unknown_prefixes(test_db: Session) -> None:
    # UNKNOWN isn't in the legacy prefix table -- leave it alone. The
    # ticker will surface on the allocation page as unclassified.
    _seed_position(test_db, "UNKNOWN:foo")
    assert migrate_synthetic_positions(test_db) == 0
    assert test_db.get(Classification, "UNKNOWN:foo") is None


def test_migration_preserves_existing_user_row(test_db: Session) -> None:
    # If the user already created a Classification for a synthetic
    # ticker (e.g. via /classifications), the migration leaves it alone.
    _seed_position(test_db, "REALESTATE:house")
    test_db.add(
        Classification(
            ticker="REALESTATE:house",
            asset_class="real_estate",
            sub_class="custom",
            source="user",
        )
    )
    test_db.commit()

    assert migrate_synthetic_positions(test_db) == 0
    row = test_db.get(Classification, "REALESTATE:house")
    assert row is not None
    assert row.sub_class == "custom"  # user value preserved
