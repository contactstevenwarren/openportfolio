"""Integration tests locking the math for 3 reference portfolios.

Each portfolio exercises a slice of the M4 pipeline:
  - all-VTI: YAML buckets → sub_class breakdown under Stocks
  - 60/40:   mixed fund classes → asset-class split
  - real-world: mix of direct + fund + manual → unclassified=0

The bundled file ``data/classifications.yaml`` is authoritative; if it
changes and these tests drift, update expectations intentionally.
"""

from datetime import UTC, datetime

from app.allocation import aggregate
from app.classifications import ClassificationEntry, load_classifications
from app.models import Position


def _pos(ticker: str, market_value: float, cost_basis: float | None = None) -> Position:
    return Position(
        account_id=1,
        ticker=ticker,
        shares=1.0,
        cost_basis=cost_basis,
        market_value=market_value,
        as_of=datetime.now(UTC),
        source="paste",
    )


# ---- Portfolio 1: all-VTI -------------------------------------------------


def test_all_vti_total() -> None:
    positions = [_pos("VTI", 100000.0)]
    result = aggregate(positions, load_classifications())

    assert result.total == 100000.0
    assert len(result.by_asset_class) == 1
    equity = result.by_asset_class[0]
    assert equity.name == "Stocks"
    assert equity.pct == 100.0


def test_all_vti_sub_class_ring_from_seed_buckets() -> None:
    positions = [_pos("VTI", 100000.0)]
    result = aggregate(positions, load_classifications())

    equity = result.by_asset_class[0]
    # VTI is a single US Stocks bucket in the seed.
    by_sub = {c.name: c.value for c in equity.children}
    assert "US Stocks" in by_sub
    assert abs(by_sub["US Stocks"] - 100_000.0) < 1.0


# ---- Portfolio 2: classic 60/40 (VTI + BND) -------------------------------


def test_60_40() -> None:
    positions = [_pos("VTI", 60_000.0), _pos("BND", 40_000.0)]
    result = aggregate(positions, load_classifications())

    assert result.total == 100_000.0
    by_name = {s.name: s for s in result.by_asset_class}
    assert by_name["Stocks"].pct == 60.0
    assert by_name["Bonds"].pct == 40.0


def test_60_40_pct_sums_to_100() -> None:
    positions = [_pos("VTI", 60_000.0), _pos("BND", 40_000.0)]
    result = aggregate(positions, load_classifications())
    assert abs(sum(s.pct for s in result.by_asset_class) - 100.0) < 1e-9


# ---- Portfolio 3: real-world mix (fund + direct + manual) -----------------


def test_real_world_mix() -> None:
    """Brokerage + HSA + real estate + gold + crypto + cash.

    v0.1.5 M4: manual-entry tickers now carry their own Classification
    row (written by /manual at commit time). For this aggregation test
    we pass the classifications explicitly.
    """
    positions = [
        _pos("VTI", 150_000.0),            # US equity fund
        _pos("VXUS", 50_000.0),            # intl equity fund
        _pos("BND", 40_000.0),             # US bonds
        _pos("AAPL", 20_000.0),            # direct US equity
        _pos("home", 400_000.0),           # real estate
        _pos("bars", 10_000.0),            # physical gold
        _pos("solana", 5_000.0),           # crypto
        _pos("CASH", 25_000.0),            # cash pool (in YAML)
        _pos("hsa-fidelity", 3_000.0),     # HSA cash sleeve
    ]
    classifications = {
        **load_classifications(),
        "home": ClassificationEntry.from_flat(
            ticker="home",
            asset_class="Real Estate",
            sub_class="Primary Residence",
            source="user",
        ),
        "bars": ClassificationEntry.from_flat(
            ticker="bars", asset_class="Commodities", sub_class="Gold", source="user"
        ),
        "solana": ClassificationEntry.from_flat(
            ticker="solana", asset_class="Crypto", sub_class="Other Crypto", source="user"
        ),
        "hsa-fidelity": ClassificationEntry.from_flat(
            ticker="hsa-fidelity",
            asset_class="Cash",
            sub_class="Cash & Savings",
            source="user",
        ),
    }
    result = aggregate(positions, classifications)

    assert result.unclassified_tickers == []
    expected_total = 703_000.0
    assert result.total == expected_total

    # Asset classes present.
    names = {s.name for s in result.by_asset_class}
    assert names >= {
        "Stocks",
        "Bonds",
        "Real Estate",
        "Commodities",
        "Crypto",
        "Cash",
    }

    # Sector rollup removed in the bucket model; list stays API-compatible (empty).
    equity = next(s for s in result.by_asset_class if s.name == "Stocks")
    assert equity.sector_breakdown == []


def test_real_world_ring_nesting_is_two_deep() -> None:
    positions = [
        _pos("VTI", 150_000.0),
        _pos("BND", 40_000.0),
        _pos("AAPL", 20_000.0),
    ]
    result = aggregate(positions, load_classifications())

    # 2-ring sunburst: asset_class → sub_class (no nested region ring).
    equity = next(s for s in result.by_asset_class if s.name == "Stocks")
    assert equity.children, "sub_class ring missing for equity"
    assert all(len(c.children) == 0 for c in equity.children)


def test_vxus_splits_into_intl_developed_and_emerging() -> None:
    positions = [_pos("VXUS", 100_000.0)]
    result = aggregate(positions, load_classifications())

    stocks = next(s for s in result.by_asset_class if s.name == "Stocks")
    assert stocks.pct == 100.0
    by_sub = {c.name: c.value for c in stocks.children}
    assert "International Developed" in by_sub or "International Emerging" in by_sub
