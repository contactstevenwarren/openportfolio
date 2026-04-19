"""Unit tests for the M4 fund look-through module.

Locks the YAML fallback shape, the 24h cache behavior, and the yfinance
adapter contract (mocked -- CI never hits the live network).
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from app import lookthrough
from app.config import settings
from app.lookthrough import (
    DEFAULT_YAML_PATH,
    Breakdown,
    CACHE_TTL,
    get_breakdown,
)
from app.models import FundHolding


@pytest.fixture(autouse=True)
def _reset_yaml_cache() -> None:
    lookthrough.reload_yaml()
    yield
    lookthrough.reload_yaml()


@pytest.fixture
def yfinance_enabled() -> None:
    """Opt-in for the tests that mock _fetch_from_yfinance.

    Production defaults to OFF (see config.lookthrough_yfinance_enabled)
    because Yahoo's taxonomy doesn't yet map onto ours; M5 adds the
    normalization layer.
    """
    previous = settings.lookthrough_yfinance_enabled
    settings.lookthrough_yfinance_enabled = True
    yield
    settings.lookthrough_yfinance_enabled = previous


# ---- YAML fallback -------------------------------------------------------


def test_yaml_file_exists() -> None:
    assert DEFAULT_YAML_PATH.exists(), f"lookthrough YAML missing at {DEFAULT_YAML_PATH}"


def test_vti_breakdown_loads_from_yaml() -> None:
    with patch("app.lookthrough._fetch_from_yfinance", return_value=None):
        br = get_breakdown("VTI")
    assert br is not None
    assert br.asset_class == {"equity": 1.0}
    assert br.region == {"US": 1.0}
    assert br.sector["technology"] > 0.0
    assert br.source == "yaml"


def test_unknown_ticker_returns_none() -> None:
    with patch("app.lookthrough._fetch_from_yfinance", return_value=None):
        assert get_breakdown("AAPL") is None


def test_yaml_sector_weights_sum_to_one_for_equity_funds() -> None:
    # Any equity fund with a sector breakdown should sum to ~1.0 (0.99-1.01).
    with patch("app.lookthrough._fetch_from_yfinance", return_value=None):
        for ticker in ("VTI", "VOO", "QQQ", "VXUS"):
            br = get_breakdown(ticker)
            assert br is not None
            assert br.sector, f"{ticker} missing sector weights"
            assert 0.99 <= sum(br.sector.values()) <= 1.01


def test_yaml_asset_class_weights_sum_to_one() -> None:
    with patch("app.lookthrough._fetch_from_yfinance", return_value=None):
        for ticker in (
            "VTI", "BND", "VNQ", "VTIVX", "VFIFX", "VT", "IXUS",
            "SWPPX", "SWAGX", "SWISX", "BIL", "CMF",
        ):
            br = get_breakdown(ticker)
            assert br is not None, f"{ticker} missing from lookthrough YAML"
            assert 0.99 <= sum(br.asset_class.values()) <= 1.01


def test_vt_splits_us_vs_intl() -> None:
    # VT is the "global equity" gotcha: without lookthrough it'd be
    # attributed to a single region (global) and mis-report US equity %.
    # With lookthrough it splits ~60/30/10 US/developed/emerging.
    with patch("app.lookthrough._fetch_from_yfinance", return_value=None):
        br = get_breakdown("VT")
    assert br is not None
    assert br.region.get("US", 0) > 0.5
    assert br.region.get("intl_developed", 0) > 0.2
    assert 0.99 <= sum(br.region.values()) <= 1.01


def test_vfifx_is_mostly_equity_mostly_us() -> None:
    # VFIFX (Target 2050) is the maintainer's biggest position
    # ($628K across HSA + 401k + Roth 401k). Gate the glidepath shape.
    with patch("app.lookthrough._fetch_from_yfinance", return_value=None):
        br = get_breakdown("VFIFX")
    assert br is not None
    assert br.asset_class.get("equity", 0) >= 0.85
    assert br.region.get("US", 0) >= 0.5


# ---- yfinance adapter (mocked) -------------------------------------------


def test_yfinance_result_preferred_over_yaml(yfinance_enabled: None) -> None:
    fake = Breakdown(
        ticker="VTI",
        asset_class={"equity": 1.0},
        sub_class={},
        sector={"technology": 1.0},
        region={"US": 1.0},
        source="yfinance",
    )
    with patch("app.lookthrough._fetch_from_yfinance", return_value=fake):
        br = get_breakdown("VTI")
    assert br is not None
    assert br.source == "yfinance"
    assert br.sector == {"technology": 1.0}


def test_yfinance_failure_falls_back_to_yaml() -> None:
    with patch("app.lookthrough._fetch_from_yfinance", return_value=None):
        br = get_breakdown("VTI")
    assert br is not None
    assert br.source == "yaml"


def test_yfinance_disabled_by_default_skips_fetch() -> None:
    # With the flag off (default), the adapter is never called.
    with patch(
        "app.lookthrough._fetch_from_yfinance",
        side_effect=AssertionError("should not be called"),
    ):
        br = get_breakdown("VTI")
    assert br is not None
    assert br.source == "yaml"


# ---- 24h SQLite cache ----------------------------------------------------


def test_cache_persists_yfinance_result(test_db: Session, yfinance_enabled: None) -> None:
    fake = Breakdown(
        ticker="SPY",
        asset_class={"equity": 1.0},
        sub_class={"us_large_cap": 1.0},
        sector={"technology": 0.5, "financials": 0.5},
        region={"US": 1.0},
        source="yfinance",
    )
    with patch("app.lookthrough._fetch_from_yfinance", return_value=fake) as mock:
        get_breakdown("SPY", db=test_db)
        get_breakdown("SPY", db=test_db)  # second call hits cache
    assert mock.call_count == 1

    rows = test_db.query(FundHolding).filter_by(fund_ticker="SPY").all()
    assert len(rows) == 5  # 1 asset_class + 1 sub_class + 2 sector + 1 region
    fetched = {r.dimension for r in rows}
    assert fetched == {"asset_class", "sub_class", "sector", "region"}


def test_cache_expires_after_ttl(test_db: Session, yfinance_enabled: None) -> None:
    fake = Breakdown(
        ticker="BND",
        asset_class={"fixed_income": 1.0},
        sub_class={"us_aggregate": 1.0},
        sector={},
        region={"US": 1.0},
        source="yfinance",
    )
    now = datetime.now(UTC)
    with patch("app.lookthrough._fetch_from_yfinance", return_value=fake) as mock:
        get_breakdown("BND", db=test_db, now=now)
        # Jump past the TTL -- second fetch should hit the network again.
        later = now + CACHE_TTL + timedelta(minutes=1)
        get_breakdown("BND", db=test_db, now=later)
    assert mock.call_count == 2


def test_cache_within_ttl_does_not_refetch(test_db: Session, yfinance_enabled: None) -> None:
    fake = Breakdown(
        ticker="AGG",
        asset_class={"fixed_income": 1.0},
        sub_class={"us_aggregate": 1.0},
        sector={},
        region={"US": 1.0},
        source="yfinance",
    )
    now = datetime.now(UTC)
    with patch("app.lookthrough._fetch_from_yfinance", return_value=fake) as mock:
        get_breakdown("AGG", db=test_db, now=now)
        get_breakdown("AGG", db=test_db, now=now + timedelta(hours=23))
    assert mock.call_count == 1


def test_cache_roundtrip_preserves_weights(test_db: Session, yfinance_enabled: None) -> None:
    fake = Breakdown(
        ticker="VXUS",
        asset_class={"equity": 1.0},
        sub_class={"intl_developed": 0.75, "intl_emerging": 0.25},
        sector={"financials": 0.21, "industrials": 0.13},
        region={"intl_developed": 0.75, "intl_emerging": 0.25},
        source="yfinance",
    )
    with patch("app.lookthrough._fetch_from_yfinance", return_value=fake):
        get_breakdown("VXUS", db=test_db)

    with patch(
        "app.lookthrough._fetch_from_yfinance",
        side_effect=AssertionError("should not be called"),
    ):
        cached = get_breakdown("VXUS", db=test_db)

    assert cached is not None
    assert cached.sub_class == fake.sub_class
    assert cached.region == fake.region
