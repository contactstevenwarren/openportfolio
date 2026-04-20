"""Integration tests locking the math for 3 reference portfolios.

Each portfolio exercises a slice of the M4 pipeline:
  - all-VTI: single-fund look-through → region/sub_class breakdown
  - 60/40:   mixed fund classes → asset-class split drives 5-number
  - real-world: mix of direct + fund + manual → unclassified=0 and
    alts math works

yfinance is mocked via ``autouse`` so tests never hit the network; the
YAML fallback is authoritative. If the YAML changes and these tests drift,
update both intentionally.
"""

from datetime import UTC, datetime

from app.allocation import aggregate
from app.classifications import load_classifications
from app.models import Position

# yfinance stays off in v0.1 by default (see config.lookthrough_yfinance_enabled);
# the YAML fallback is authoritative, and these tests pin its math.


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


def test_all_vti_total_and_summary() -> None:
    positions = [_pos("VTI", 100000.0)]
    result = aggregate(positions, load_classifications())

    assert result.total == 100000.0
    assert len(result.by_asset_class) == 1
    equity = result.by_asset_class[0]
    assert equity.name == "equity"
    assert equity.pct == 100.0

    assert result.summary is not None
    assert result.summary.us_equity_pct == 100.0
    assert result.summary.intl_equity_pct == 0.0
    assert result.summary.cash_pct == 0.0
    assert result.summary.alts_pct == 0.0


def test_all_vti_sub_class_ring_from_lookthrough() -> None:
    positions = [_pos("VTI", 100000.0)]
    result = aggregate(positions, load_classifications())

    equity = result.by_asset_class[0]
    # Ring 2 (region) = US for VTI; Ring 3 (sub_class) fans out across
    # us_large_cap / us_mid_cap / us_small_cap from the lookthrough YAML.
    # us_large_cap dominates at ~72% so the tree must reflect that.
    assert equity.children, "ring 2 missing"
    ring3_large_cap = 0.0
    for ring2 in equity.children:
        for ring3 in ring2.children:
            if ring3.name == "us_large_cap":
                ring3_large_cap += ring3.value
    assert 65_000 < ring3_large_cap < 80_000, (
        f"us_large_cap allocation off: {ring3_large_cap}"
    )


# ---- Portfolio 2: classic 60/40 (VTI + BND) -------------------------------


def test_60_40() -> None:
    positions = [_pos("VTI", 60_000.0), _pos("BND", 40_000.0)]
    result = aggregate(positions, load_classifications())

    assert result.total == 100_000.0
    by_name = {s.name: s for s in result.by_asset_class}
    assert by_name["equity"].pct == 60.0
    assert by_name["fixed_income"].pct == 40.0

    assert result.summary is not None
    assert result.summary.us_equity_pct == 60.0
    assert result.summary.intl_equity_pct == 0.0
    assert result.summary.cash_pct == 0.0
    assert result.summary.alts_pct == 0.0


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
    from app.classifications import ClassificationEntry

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
        "home": ClassificationEntry(
            ticker="home", asset_class="real_estate", sub_class="direct",
            region="US", source="user",
        ),
        "bars": ClassificationEntry(
            ticker="bars", asset_class="commodity", sub_class="gold", source="user",
        ),
        "solana": ClassificationEntry(
            ticker="solana", asset_class="crypto", sub_class="other", source="user",
        ),
        "hsa-fidelity": ClassificationEntry(
            ticker="hsa-fidelity", asset_class="cash", sub_class="hsa_cash",
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
        "equity",
        "fixed_income",
        "real_estate",
        "commodity",
        "crypto",
        "cash",
    }

    summary = result.summary
    assert summary is not None
    # US equity = VTI 150k * 100% + AAPL 20k * 100% = 170k
    assert abs(summary.us_equity_pct - (170_000.0 / expected_total * 100)) < 0.01
    # Intl equity = VXUS 50k * 100%
    assert abs(summary.intl_equity_pct - (50_000.0 / expected_total * 100)) < 0.01
    # Cash = CASH 25k + HSA_CASH 3k
    assert abs(summary.cash_pct - (28_000.0 / expected_total * 100)) < 0.01
    # Alts = real estate 400k + gold 10k + crypto 5k = 415k
    assert abs(summary.alts_pct - (415_000.0 / expected_total * 100)) < 0.01

    # Equity sector_breakdown: VTI + VXUS pull from lookthrough.yaml,
    # AAPL contributes 100% to its classifications.yaml sector (tech).
    # Sector names must come from the equity tickers' sector data, and
    # the rollup must sum back to the equity slice value.
    equity = next(s for s in result.by_asset_class if s.name == "equity")
    assert equity.sector_breakdown, "expected non-empty equity sector_breakdown"
    expected_sectors = {
        "technology",
        "financials",
        "consumer_discretionary",
        "healthcare",
        "industrials",
        "communication_services",
        "consumer_staples",
        "energy",
        "real_estate",
        "utilities",
        "materials",
    }
    sector_names = {s.name for s in equity.sector_breakdown}
    assert sector_names <= expected_sectors, (
        f"unexpected sectors: {sector_names - expected_sectors}"
    )
    sector_sum = sum(s.value for s in equity.sector_breakdown)
    assert abs(sector_sum - equity.value) < 0.01


def test_real_world_ring_nesting_is_three_deep() -> None:
    positions = [
        _pos("VTI", 150_000.0),
        _pos("BND", 40_000.0),
        _pos("AAPL", 20_000.0),
    ]
    result = aggregate(positions, load_classifications())

    # Ring 1 (asset_class) must have ring 2 children with ring 3 leaves
    # for at least equity.
    equity = next(s for s in result.by_asset_class if s.name == "equity")
    assert equity.children, "ring 2 missing for equity"
    assert all(ring2.children for ring2 in equity.children), "ring 3 missing under equity"


def test_vxus_splits_into_intl_developed_and_emerging() -> None:
    positions = [_pos("VXUS", 100_000.0)]
    result = aggregate(positions, load_classifications())

    summary = result.summary
    assert summary is not None
    # VXUS is 100% intl equity (split ~75/25 between developed and
    # emerging in the YAML); either way it all counts as intl.
    assert summary.intl_equity_pct == 100.0
    assert summary.us_equity_pct == 0.0
