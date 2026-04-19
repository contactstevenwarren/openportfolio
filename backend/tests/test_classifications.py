"""Unit tests for the classifications YAML loader.

Locks the 10-ticker seed set for M2 and the shape of each entry. When M3
expands to ~50 tickers, EXPECTED_SEED stays unchanged -- new tickers are
additive.
"""

from pathlib import Path

import pytest
import yaml

from app.classifications import (
    DEFAULT_PATH,
    ClassificationEntry,
    load_classifications,
)

EXPECTED_SEED = {"VTI", "VXUS", "BND", "VNQ", "GLD", "BTC", "SPY", "QQQ", "AAPL", "CASH"}
VALID_ASSET_CLASSES = {"equity", "fixed_income", "real_estate", "commodity", "crypto", "cash"}


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
