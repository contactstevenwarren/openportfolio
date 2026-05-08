"""Unit tests for the classifications YAML loader.

Locks the 10-ticker seed set for M2 and the shape of each entry; later
phases are additive.
"""

from pathlib import Path

import pytest
import yaml

from app.classifications import (
    DEFAULT_PATH,
    ClassificationEntry,
    classify,
    load_classifications,
    primary_asset_class,
)
from app.taxonomy import TAXONOMY

EXPECTED_SEED = {"VTI", "VXUS", "BND", "VNQ", "GLD", "BTC", "SPY", "QQQ", "AAPL", "CASH"}
VALID_ASSET_CLASSES = set(TAXONOMY.keys())


def test_default_yaml_file_exists() -> None:
    assert DEFAULT_PATH.exists(), f"classifications YAML missing at {DEFAULT_PATH}"


def test_all_seed_tickers_present() -> None:
    entries = load_classifications()
    assert EXPECTED_SEED.issubset(entries.keys())


def test_every_entry_has_valid_asset_class() -> None:
    entries = load_classifications()
    for ticker, entry in entries.items():
        for b in entry.buckets:
            assert b.asset_class in VALID_ASSET_CLASSES, (
                f"{ticker} has unknown asset_class {b.asset_class!r}"
            )


def test_cash_classified_as_cash() -> None:
    entries = load_classifications()
    assert primary_asset_class(entries["CASH"]) == "Cash"


def test_us_equity_tickers_have_us_sub_class_dominance() -> None:
    entries = load_classifications()
    for ticker in ("VTI", "SPY", "QQQ", "AAPL"):
        eq_buckets = [b for b in entries[ticker].buckets if b.asset_class == "Stocks"]
        assert eq_buckets, f"{ticker}: expected at least one Stocks bucket"
        dominant = max(eq_buckets, key=lambda b: b.weight)
        assert dominant.sub_class is not None
        assert dominant.sub_class == "US Stocks", (
            f"{ticker} dominant Stocks sub_class {dominant.sub_class!r}"
        )


def test_entry_type_is_frozen_dataclass() -> None:
    entry = load_classifications()["VTI"]
    assert isinstance(entry, ClassificationEntry)
    with pytest.raises(Exception):
        entry.ticker = "mutated"  # type: ignore[misc]


def test_missing_asset_class_raises(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text(
        yaml.safe_dump(
            {"FOO": {"buckets": [{"sub_class": "x", "weight": 1.0}]}}
        )
    )
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
    assert primary_asset_class(entry) == "Stocks"


def test_classify_unknown_returns_none() -> None:
    entries = load_classifications()
    assert classify("ZZZZZ", entries) is None


def test_classify_no_longer_splits_on_colon() -> None:
    # v0.1.5 M4 removed the synthetic-prefix fallback. A PREFIX:suffix
    # ticker is just a plain ticker now; classification must come from
    # YAML or a user DB row (or be None = unclassified).
    assert classify("REALESTATE:123Main", {}) is None
