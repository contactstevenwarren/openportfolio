"""Tests for the allocation drill-down feature (feat/donut-drill-down).

Covers:
  1. _per_position_contributions generator yields tuples summing to aggregate() totals.
  2. positions_for_slice total equals aggregate() slice value (L1 and L2).
  3. Fund look-through: ETF contribution = market_value * weight; is_partial=True.
  4. Direct ticker: full market_value contribution; is_partial=False.
  5. User override suppresses look-through.
  6. Endpoint: unknown class → 404; unknown l2 → 400; empty class → 200 + [].
  7. /api/allocation regression: byte-equal output before/after the refactor is
     validated implicitly by running all existing test_allocation tests unchanged.
"""

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.allocation import (
    _per_position_contributions,
    aggregate,
    positions_for_slice,
)
from app.classifications import ClassificationEntry, load_classifications
from app.lookthrough import Breakdown
from app.models import Account, Position


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _pos(
    ticker: str,
    market_value: float,
    account_id: int = 0,
    investable: bool = True,
) -> Position:
    return Position(
        ticker=ticker,
        shares=1.0,
        market_value=market_value,
        cost_basis=None,
        as_of=datetime.now(UTC),
        source="paste",
        account_id=account_id,
        investable=investable,
    )


def _cls(**kwargs) -> dict[str, ClassificationEntry]:
    """Build a classifications dict from keyword args: ticker=asset_class."""
    return {
        ticker: ClassificationEntry(ticker=ticker, asset_class=ac)
        for ticker, ac in kwargs.items()
    }


# ---------------------------------------------------------------------------
# 1. Generator sums match aggregate() totals
# ---------------------------------------------------------------------------


def test_generator_sums_match_aggregate_totals() -> None:
    positions = [
        _pos("VTI", 60000.0),
        _pos("BND", 30000.0),
        _pos("GLD", 10000.0),
    ]
    classifications = _cls(VTI="equity", BND="fixed_income", GLD="commodity")

    result = aggregate(positions, classifications)

    # Sum generator dollars by ac_bucket.
    from collections import defaultdict
    gen_totals: dict[str, float] = defaultdict(float)
    for contrib in _per_position_contributions(positions, classifications):
        gen_totals[contrib.ac_bucket] += contrib.dollars

    for s in result.by_asset_class:
        if s.value > 0:
            assert abs(gen_totals[s.name] - s.value) < 1e-6, (
                f"{s.name}: aggregate={s.value}, generator={gen_totals[s.name]}"
            )


def test_generator_sums_with_fund_lookthrough() -> None:
    """VTI has look-through data (equity 100%) so should map 1:1 to equity."""
    positions = [_pos("VTI", 50000.0)]
    classifications = load_classifications()

    result = aggregate(positions, classifications)
    equity = next(s for s in result.by_asset_class if s.name == "equity")

    from collections import defaultdict
    gen_totals: dict[str, float] = defaultdict(float)
    for contrib in _per_position_contributions(positions, classifications):
        gen_totals[contrib.ac_bucket] += contrib.dollars

    assert abs(gen_totals["equity"] - equity.value) < 0.01


# ---------------------------------------------------------------------------
# 2. positions_for_slice total equals aggregate() slice value
# ---------------------------------------------------------------------------


def test_positions_for_slice_total_matches_aggregate_l1() -> None:
    positions = [
        _pos("VTI", 60000.0, account_id=1),
        _pos("BND", 30000.0, account_id=1),
        _pos("GLD", 10000.0, account_id=1),
    ]
    classifications = _cls(VTI="equity", BND="fixed_income", GLD="commodity")

    result = aggregate(positions, classifications)
    equity_slice = next(s for s in result.by_asset_class if s.name == "equity")

    sr = positions_for_slice(
        positions, classifications, asset_class="equity",
        portfolio_total=result.total,
    )

    assert abs(sr.total - equity_slice.value) < 1.0, (
        f"positions_for_slice total={sr.total}, aggregate equity={equity_slice.value}"
    )


def test_positions_for_slice_total_matches_aggregate_l2() -> None:
    """For equity drilled to 'US', contribution total matches the US region slice."""
    positions = [
        _pos("MYSTOCK", 40000.0, account_id=1),
        _pos("INTLSTOCK", 20000.0, account_id=1),
    ]
    classifications = {
        "MYSTOCK": ClassificationEntry(
            ticker="MYSTOCK", asset_class="equity", region="US"
        ),
        "INTLSTOCK": ClassificationEntry(
            ticker="INTLSTOCK", asset_class="equity", region="intl_developed"
        ),
    }

    result = aggregate(positions, classifications)
    equity_slice = next(s for s in result.by_asset_class if s.name == "equity")
    us_region = next((c for c in equity_slice.children if c.name == "US"), None)
    assert us_region is not None

    sr = positions_for_slice(
        positions, classifications, asset_class="equity", l2="US",
        portfolio_total=result.total,
    )

    assert abs(sr.total - us_region.value) < 1.0


def test_positions_for_slice_multiple_accounts_same_ticker() -> None:
    """Same ticker in two accounts appears as two separate rows."""
    positions = [
        _pos("VTI", 30000.0, account_id=1),
        _pos("VTI", 20000.0, account_id=2),
    ]
    classifications = _cls(VTI="equity")

    sr = positions_for_slice(
        positions, classifications, asset_class="equity",
        portfolio_total=50000.0,
        account_names={1: "Schwab", 2: "Fidelity"},
    )

    assert len(sr.positions) == 2
    names = {p.account_name for p in sr.positions}
    assert names == {"Schwab", "Fidelity"}
    assert abs(sr.total - 50000.0) < 1e-6


# ---------------------------------------------------------------------------
# 3. Fund look-through: is_partial + weighted contribution
# ---------------------------------------------------------------------------


def test_fund_lookthrough_partial_and_weighted() -> None:
    """A 60/40 multi-class fund yields partial contributions per class."""
    fake_breakdown = Breakdown(
        ticker="MYFUND",
        asset_class={"equity": 0.6, "fixed_income": 0.4},
        sub_class={},
        sector={},
        region={},
        source="yaml",
    )
    positions = [_pos("MYFUND", 100000.0, account_id=1)]
    classifications = {
        "MYFUND": ClassificationEntry(ticker="MYFUND", asset_class="equity")
    }

    with patch("app.allocation.get_breakdown", return_value=fake_breakdown):
        sr_equity = positions_for_slice(
            positions, classifications, asset_class="equity",
            portfolio_total=100000.0,
        )
        sr_fi = positions_for_slice(
            positions, classifications, asset_class="fixed_income",
            portfolio_total=100000.0,
        )

    assert len(sr_equity.positions) == 1
    assert abs(sr_equity.positions[0].contributing_value - 60000.0) < 1.0
    assert sr_equity.positions[0].is_partial is True

    assert len(sr_fi.positions) == 1
    assert abs(sr_fi.positions[0].contributing_value - 40000.0) < 1.0
    assert sr_fi.positions[0].is_partial is True

    # Combined totals sum to the position's full market value.
    assert abs(sr_equity.total + sr_fi.total - 100000.0) < 1.0


# ---------------------------------------------------------------------------
# 4. Direct ticker: full market_value, is_partial=False
# ---------------------------------------------------------------------------


def test_direct_ticker_full_value_not_partial() -> None:
    positions = [_pos("VTI", 50000.0, account_id=1)]
    # Override to suppress look-through (source="user" means no get_breakdown).
    classifications = {
        "VTI": ClassificationEntry(
            ticker="VTI", asset_class="equity", region="US", source="user"
        )
    }

    sr = positions_for_slice(
        positions, classifications, asset_class="equity",
        portfolio_total=50000.0,
    )

    assert len(sr.positions) == 1
    assert abs(sr.positions[0].contributing_value - 50000.0) < 1e-6
    assert sr.positions[0].is_partial is False


# ---------------------------------------------------------------------------
# 5. User override suppresses look-through
# ---------------------------------------------------------------------------


def test_user_override_suppresses_lookthrough() -> None:
    """User-classified VTI should not use the YAML breakdown."""
    called = []

    def fake_breakdown(ticker, db=None):
        called.append(ticker)
        return None

    positions = [_pos("VTI", 40000.0, account_id=1)]
    classifications = {
        "VTI": ClassificationEntry(
            ticker="VTI", asset_class="equity", source="user"
        )
    }

    with patch("app.allocation.get_breakdown", side_effect=fake_breakdown):
        sr = positions_for_slice(
            positions, classifications, asset_class="equity",
            portfolio_total=40000.0,
        )

    assert "VTI" not in called
    assert len(sr.positions) == 1
    assert sr.positions[0].classification_source == "user"


# ---------------------------------------------------------------------------
# 6. Endpoint contract tests
# ---------------------------------------------------------------------------


def _seed_portfolio(db: Session, account: Account) -> None:
    db.add_all([
        Position(
            account_id=account.id, ticker="VTI", shares=1.0,
            market_value=60000.0, as_of=datetime.now(UTC), source="paste",
        ),
        Position(
            account_id=account.id, ticker="BND", shares=1.0,
            market_value=40000.0, as_of=datetime.now(UTC), source="paste",
        ),
    ])
    db.commit()


def test_endpoint_unknown_asset_class_404(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.get("/api/allocation/positions/not_a_class", headers=auth_headers)
    assert r.status_code == 404


def test_endpoint_unknown_l2_400(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()
    _seed_portfolio(test_db, account)

    # equity slice exists; "not_a_region" is not a valid L2.
    r = client.get(
        "/api/allocation/positions/equity?l2=not_a_region",
        headers=auth_headers,
    )
    assert r.status_code == 400


def test_endpoint_empty_class_returns_200_empty_list(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # No positions in DB → equity slice has no data.
    r = client.get("/api/allocation/positions/equity", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["asset_class"] == "equity"
    assert body["positions"] == []
    assert body["total"] == 0.0


def test_endpoint_l1_sums_to_allocation_slice(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()
    _seed_portfolio(test_db, account)

    alloc = client.get("/api/allocation", headers=auth_headers).json()
    equity_slice = next(s for s in alloc["by_asset_class"] if s["name"] == "equity")

    drill = client.get("/api/allocation/positions/equity", headers=auth_headers).json()

    assert drill["asset_class"] == "equity"
    assert drill["l2"] is None
    assert len(drill["positions"]) >= 1
    # Contributions must sum to within $1 of the slice value.
    contrib_sum = sum(p["contributing_value"] for p in drill["positions"])
    assert abs(contrib_sum - equity_slice["value"]) < 1.0


def test_endpoint_l2_filter(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """Drill to a valid L2 segment returns only that segment's positions."""
    from app.models import Classification as DbClassification

    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()

    # Add two equity positions in different regions.
    test_db.add_all([
        Position(
            account_id=account.id, ticker="MYUS", shares=1.0,
            market_value=40000.0, as_of=datetime.now(UTC), source="paste",
        ),
        Position(
            account_id=account.id, ticker="MYINTL", shares=1.0,
            market_value=20000.0, as_of=datetime.now(UTC), source="paste",
        ),
    ])
    test_db.add_all([
        DbClassification(
            ticker="MYUS", asset_class="equity", region="US", source="user"
        ),
        DbClassification(
            ticker="MYINTL", asset_class="equity", region="intl_developed", source="user"
        ),
    ])
    test_db.commit()

    drill = client.get(
        "/api/allocation/positions/equity?l2=US",
        headers=auth_headers,
    ).json()

    assert drill["l2"] == "US"
    tickers = {p["ticker"] for p in drill["positions"]}
    assert "MYUS" in tickers
    assert "MYINTL" not in tickers

    # Must be within $1 of the US region slice value.
    alloc = client.get("/api/allocation", headers=auth_headers).json()
    equity = next(s for s in alloc["by_asset_class"] if s["name"] == "equity")
    us_region = next((c for c in equity["children"] if c["name"] == "US"), None)
    assert us_region is not None
    contrib_sum = sum(p["contributing_value"] for p in drill["positions"])
    assert abs(contrib_sum - us_region["value"]) < 1.0


def test_endpoint_requires_auth(client: TestClient) -> None:
    r = client.get("/api/allocation/positions/equity")
    assert r.status_code == 401


def test_endpoint_positions_sorted_by_value_desc(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()

    test_db.add_all([
        Position(
            account_id=account.id, ticker="VTI", shares=1.0,
            market_value=60000.0, as_of=datetime.now(UTC), source="paste",
        ),
        Position(
            account_id=account.id, ticker="VOO", shares=1.0,
            market_value=20000.0, as_of=datetime.now(UTC), source="paste",
        ),
    ])
    test_db.commit()

    drill = client.get("/api/allocation/positions/equity", headers=auth_headers).json()
    values = [p["contributing_value"] for p in drill["positions"]]
    assert values == sorted(values, reverse=True)
