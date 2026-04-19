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
    classify,
    load_classifications,
)

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
    entries = load_classifications()
    for t in ("MSFT", "NVDA", "BRK.B", "VOO", "SCHD", "BNDX", "SPAXX"):
        assert t in entries, f"expected {t} in classifications YAML"


# ---- synthetic prefix resolver ------------------------------------------


def test_classify_exact_match_wins() -> None:
    entries = load_classifications()
    entry = classify("VTI", entries)
    assert entry is not None
    assert entry.asset_class == "equity"


def test_classify_unknown_returns_none() -> None:
    entries = load_classifications()
    assert classify("ZZZZZ", entries) is None


def test_classify_synthetic_real_estate() -> None:
    entry = classify("REALESTATE:123Main", {})
    assert entry is not None
    assert entry.asset_class == "real_estate"
    assert entry.ticker == "REALESTATE:123Main"  # label preserved


def test_classify_synthetic_gold() -> None:
    entry = classify("GOLD:physical-bar", {})
    assert entry is not None
    assert entry.asset_class == "commodity"
    assert entry.sub_class == "gold"


def test_classify_synthetic_crypto() -> None:
    entry = classify("CRYPTO:solana", {})
    assert entry is not None
    assert entry.asset_class == "crypto"


def test_classify_synthetic_private() -> None:
    entry = classify("PRIVATE:startup-xyz", {})
    assert entry is not None
    assert entry.asset_class == "private"


def test_classify_synthetic_hsa_cash() -> None:
    entry = classify("HSA_CASH:fidelity", {})
    assert entry is not None
    assert entry.asset_class == "cash"
    assert entry.sub_class == "hsa_cash"


def test_classify_prefix_case_insensitive() -> None:
    entry = classify("realestate:789Oak", {})
    assert entry is not None
    assert entry.asset_class == "real_estate"


def test_classify_unknown_prefix_returns_none() -> None:
    assert classify("UNKNOWN:foo", {}) is None


def test_classify_exact_match_beats_prefix_lookup() -> None:
    # YAML entry takes precedence over prefix match even if both exist.
    entries = {
        "CASH:something": ClassificationEntry(
            ticker="CASH:something", asset_class="equity"
        )
    }
    entry = classify("CASH:something", entries)
    assert entry is not None
    assert entry.asset_class == "equity"
