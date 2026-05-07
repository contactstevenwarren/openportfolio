"""Unit tests for apply_drift (v0.2)."""

from app.allocation import aggregate
from app.classifications import BucketEntry, ClassificationEntry
from app.drift import apply_drift
from app.models import Position


def _pos(ticker: str, mv: float) -> Position:
    from datetime import UTC, datetime

    return Position(
        account_id=1,
        ticker=ticker,
        shares=1.0,
        market_value=mv,
        as_of=datetime.now(UTC),
        source="paste",
    )


def _classes() -> dict[str, ClassificationEntry]:
    return {
        "E1": ClassificationEntry.from_flat(
            ticker="E1", asset_class="Stocks", sub_class="US Stocks"
        ),
        "E2": ClassificationEntry.from_flat(
            ticker="E2",
            asset_class="Stocks",
            sub_class="International Developed",
        ),
        "B1": ClassificationEntry(
            ticker="B1",
            source="yaml",
            buckets=(
                BucketEntry("Bonds", "US Treasury", 0.5),
                BucketEntry("Bonds", "US Corporate", 0.5),
            ),
        ),
    }


def test_no_targets_all_drift_none() -> None:
    result = aggregate(
        [_pos("E1", 60_000.0), _pos("B1", 40_000.0)], _classes()
    )
    out = apply_drift(result, {}, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    assert out.max_drift is None
    assert out.max_drift_band is None
    for s in out.by_asset_class:
        assert s.target_pct is None
        assert s.drift_pct is None
        assert s.drift_band is None
        for c in s.children:
            assert c.target_pct is None
            for leaf in c.children:
                assert leaf.target_pct is None


def test_root_drift_and_max() -> None:
    result = aggregate(
        [_pos("E1", 60_000.0), _pos("B1", 40_000.0)], _classes()
    )
    targets = {"Stocks": 55.0, "Bonds": 45.0}
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    eq = next(s for s in out.by_asset_class if s.name == "Stocks")
    fi = next(s for s in out.by_asset_class if s.name == "Bonds")
    assert eq.target_pct == 55.0
    assert abs(eq.drift_pct - (eq.pct - 55.0)) < 1e-6
    assert eq.drift_band == "act"  # |5| > drift_act_pct=3 in test, <= urgent=10
    assert fi.drift_band == "act"
    assert out.max_drift is not None
    assert abs(out.max_drift - 5.0) < 1e-6
    assert out.max_drift_band == "act"


def test_max_drift_band_worst_on_tie() -> None:
    """Two slices with same |drift| but different bands -> pick worse band."""
    result = aggregate([_pos("E1", 50_000.0), _pos("B1", 50_000.0)], _classes())
    targets = {"Stocks": 48.5, "Bonds": 48.5}
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    # each drift 1.5% -> watch band (tolerance=1 < 1.5 <= act=3)
    assert out.max_drift_band == "watch"
    targets2 = {"Stocks": 52.0, "Bonds": 46.0}
    out2 = apply_drift(
        result, targets2, drift_tolerance_pct=0.5, drift_act_pct=3.0, drift_urgent_pct=10.0
    )
    # |2| watch, |4| act (>3, <=10) -- slice with 4 wins band act
    assert abs((out2.max_drift or 0) - 4.0) < 1e-6
    assert out2.max_drift_band == "act"


def test_equity_sub_class_drill_independent_of_root() -> None:
    result = aggregate(
        [_pos("E1", 30_000.0), _pos("E2", 30_000.0)], _classes()
    )
    targets = {"Stocks.US Stocks": 40.0, "Stocks.International Developed": 60.0}
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    eq = next(s for s in out.by_asset_class if s.name == "Stocks")
    assert eq.target_pct is None  # no root targets
    us = next(c for c in eq.children if c.name == "US Stocks")
    intl = next(c for c in eq.children if c.name == "International Developed")
    assert us.target_pct == 40.0
    assert intl.target_pct == 60.0
    assert us.drift_pct is not None
    assert intl.drift_pct is not None


def test_sector_breakdown_untouched() -> None:
    result = aggregate([_pos("E1", 100_000.0)], _classes())
    targets = {"Stocks": 100.0}
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    eq = next(s for s in out.by_asset_class if s.name == "Stocks")
    for sec in eq.sector_breakdown:
        assert sec.target_pct is None
        assert sec.drift_pct is None
        assert sec.drift_band is None


def test_Bonds_sub_class_drift() -> None:
    """FI L2 targets key by sub_class (2-ring allocation)."""
    result = aggregate([_pos("B1", 100_000.0)], _classes())
    targets = {"Bonds.US Treasury": 50.0, "Bonds.US Corporate": 50.0}
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    fi = next(s for s in out.by_asset_class if s.name == "Bonds")
    by_name = {c.name: c for c in fi.children}
    assert by_name["US Treasury"].target_pct == 50.0
    assert by_name["US Corporate"].target_pct == 50.0
    assert abs(by_name["US Treasury"].drift_pct or 0) < 1e-6
    assert abs(by_name["US Corporate"].drift_pct or 0) < 1e-6


def _classes_with_tips() -> dict[str, ClassificationEntry]:
    base = _classes()
    mix = (
        BucketEntry("Bonds", "US Treasury", 0.6),
        BucketEntry("Bonds", "US Corporate", 0.4),
    )
    base["B1"] = ClassificationEntry(ticker="B1", source="yaml", buckets=mix)
    base["B2"] = ClassificationEntry(ticker="B2", source="yaml", buckets=mix)
    return base


def test_equity_region_drift_is_pct_of_parent_not_portfolio() -> None:
    """L2 equity targets are % of equity, not % of portfolio.

    Equity = $60k of $100k (60% of portfolio). US = $30k (50% of
    equity, 30% of portfolio). With target Stocks.US Stocks = 40 the drift
    must be 50 - 40 = 10 (parent-scoped), *not* 30 - 40 = -10
    (portfolio-scoped).
    """
    result = aggregate(
        [
            _pos("E1", 30_000.0),
            _pos("E2", 30_000.0),
            _pos("B1", 40_000.0),
        ],
        _classes(),
    )
    targets = {"Stocks.US Stocks": 40.0, "Stocks.International Developed": 60.0}
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    eq = next(s for s in out.by_asset_class if s.name == "Stocks")
    us = next(c for c in eq.children if c.name == "US Stocks")
    intl = next(c for c in eq.children if c.name == "International Developed")
    assert us.target_pct == 40.0
    assert abs(us.drift_pct - 10.0) < 1e-6
    assert abs(intl.drift_pct - (-10.0)) < 1e-6


def test_non_equity_subclass_drift_is_pct_of_parent_not_portfolio() -> None:
    """L2 FI targets are % of parent (FI), not % of portfolio.

    B1 and B2 are both US-side FI; allocation places them as sibling sub_class
    slices. Targets us_aggregate=60, us_tips=40 -> drift 0 on both.
    """
    result = aggregate(
        [
            _pos("B1", 15_000.0),
            _pos("B2", 10_000.0),
            _pos("E1", 25_000.0),
        ],
        _classes_with_tips(),
    )
    targets = {
        "Bonds.US Treasury": 60.0,
        "Bonds.US Corporate": 40.0,
    }
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    fi = next(s for s in out.by_asset_class if s.name == "Bonds")
    seen: dict[str, float] = {}
    for leaf in fi.children:
        if leaf.drift_pct is not None:
            seen[leaf.name] = leaf.drift_pct
            assert leaf.drift_band == "ok"
    assert abs(seen["US Treasury"]) < 1e-6
    assert abs(seen["US Corporate"]) < 1e-6


def _classes_fi_multiregion() -> dict[str, ClassificationEntry]:
    """FI with US and intl sub_class buckets (no separate region ring)."""
    base = _classes()
    base["B1"] = ClassificationEntry.from_flat(
        ticker="B1", asset_class="Bonds", sub_class="US Treasury"
    )
    base["BINT"] = ClassificationEntry.from_flat(
        ticker="BINT",
        asset_class="Bonds",
        sub_class="International Bonds",
    )
    return base


def test_fi_multiregion_drift_by_sub_class() -> None:
    """Multiple FI sub_class slices: L2 targets are % of Bonds parent."""
    result = aggregate(
        [
            _pos("B1", 15_000.0),
            _pos("BINT", 10_000.0),
            _pos("E1", 25_000.0),
        ],
        _classes_fi_multiregion(),
    )
    targets = {
        "Bonds.US Treasury": 60.0,
        "Bonds.International Bonds": 40.0,
    }
    out = apply_drift(result, targets, drift_tolerance_pct=1.0, drift_act_pct=3.0, drift_urgent_pct=10.0)
    fi = next(s for s in out.by_asset_class if s.name == "Bonds")
    us_leaf = next(c for c in fi.children if c.name == "US Treasury")
    intl_leaf = next(c for c in fi.children if c.name == "International Bonds")
    assert us_leaf.target_pct == 60.0
    assert abs(us_leaf.drift_pct) < 1e-6
    assert us_leaf.drift_band == "ok"
    assert intl_leaf.target_pct == 40.0
    assert abs(intl_leaf.drift_pct) < 1e-6
    assert intl_leaf.drift_band == "ok"
