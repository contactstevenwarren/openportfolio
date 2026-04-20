"""Unit tests for apply_drift (v0.2)."""

from app.allocation import aggregate
from app.classifications import ClassificationEntry
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
        "E1": ClassificationEntry(
            ticker="E1", asset_class="equity", sub_class="us_large_cap", region="US"
        ),
        "E2": ClassificationEntry(
            ticker="E2",
            asset_class="equity",
            sub_class="intl_developed",
            region="intl_developed",
        ),
        "B1": ClassificationEntry(
            ticker="B1",
            asset_class="fixed_income",
            sub_class="us_aggregate",
            region="US",
        ),
    }


def test_no_targets_all_drift_none() -> None:
    result = aggregate(
        [_pos("E1", 60_000.0), _pos("B1", 40_000.0)], _classes()
    )
    out = apply_drift(result, {}, drift_minor_pct=1.0, drift_major_pct=3.0)
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
    targets = {"equity": 55.0, "fixed_income": 45.0}
    out = apply_drift(result, targets, drift_minor_pct=1.0, drift_major_pct=3.0)
    eq = next(s for s in out.by_asset_class if s.name == "equity")
    fi = next(s for s in out.by_asset_class if s.name == "fixed_income")
    assert eq.target_pct == 55.0
    assert abs(eq.drift_pct - (eq.pct - 55.0)) < 1e-6
    assert eq.drift_band == "major"  # |5| > drift_major_pct default path in test
    assert fi.drift_band == "major"
    assert out.max_drift is not None
    assert abs(out.max_drift - 5.0) < 1e-6
    assert out.max_drift_band == "major"


def test_max_drift_band_worst_on_tie() -> None:
    """Two slices with same |drift| but different bands -> pick worse band."""
    result = aggregate([_pos("E1", 50_000.0), _pos("B1", 50_000.0)], _classes())
    targets = {"equity": 48.5, "fixed_income": 48.5}
    out = apply_drift(result, targets, drift_minor_pct=1.0, drift_major_pct=3.0)
    # each drift 1.5% -> minor band
    assert out.max_drift_band == "minor"
    targets2 = {"equity": 52.0, "fixed_income": 46.0}
    out2 = apply_drift(result, targets2, drift_minor_pct=0.5, drift_major_pct=3.0)
    # |2| and |4| -> max 4 is major, slice with 4 wins band major
    assert abs((out2.max_drift or 0) - 4.0) < 1e-6
    assert out2.max_drift_band == "major"


def test_equity_region_drill_independent_of_root() -> None:
    result = aggregate(
        [_pos("E1", 30_000.0), _pos("E2", 30_000.0)], _classes()
    )
    targets = {"equity.US": 40.0, "equity.intl_developed": 60.0}
    out = apply_drift(result, targets, drift_minor_pct=1.0, drift_major_pct=3.0)
    eq = next(s for s in out.by_asset_class if s.name == "equity")
    assert eq.target_pct is None  # no root targets
    us = next(c for c in eq.children if c.name == "US")
    intl = next(c for c in eq.children if c.name == "intl_developed")
    assert us.target_pct == 40.0
    assert intl.target_pct == 60.0
    assert us.drift_pct is not None
    assert intl.drift_pct is not None


def test_sector_breakdown_untouched() -> None:
    result = aggregate([_pos("E1", 100_000.0)], _classes())
    targets = {"equity": 100.0}
    out = apply_drift(result, targets, drift_minor_pct=1.0, drift_major_pct=3.0)
    eq = next(s for s in out.by_asset_class if s.name == "equity")
    for sec in eq.sector_breakdown:
        assert sec.target_pct is None
        assert sec.drift_pct is None
        assert sec.drift_band is None


def test_fixed_income_subclass_aggregate_drift() -> None:
    result = aggregate([_pos("B1", 100_000.0)], _classes())
    targets = {"fixed_income.us_aggregate": 95.0}
    out = apply_drift(result, targets, drift_minor_pct=1.0, drift_major_pct=3.0)
    fi = next(s for s in out.by_asset_class if s.name == "fixed_income")
    for reg in fi.children:
        for leaf in reg.children:
            if leaf.name == "us_aggregate":
                assert leaf.target_pct == 95.0
                assert abs(leaf.drift_pct - (100.0 - 95.0)) < 1e-6
