"""Tests for allocation drill-down (positions_for_slice + aggregate parity)."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.allocation import (
    _per_position_contributions,
    aggregate,
    positions_for_slice,
)
from app.classifications import BucketEntry, ClassificationEntry, load_classifications
from app.models import Account, Classification, ClassificationBucket, Position


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


def _one(ticker: str, ac: str, sc: str | None = None, *, source: str = "yaml") -> ClassificationEntry:
    return ClassificationEntry.from_flat(ticker=ticker, asset_class=ac, sub_class=sc, source=source)


def _cls(**kwargs: str) -> dict[str, ClassificationEntry]:
    return {ticker: _one(ticker, ac) for ticker, ac in kwargs.items()}


def test_generator_sums_match_aggregate_totals() -> None:
    positions = [
        _pos("VTI", 60000.0),
        _pos("BND", 30000.0),
        _pos("GLD", 10000.0),
    ]
    classifications = _cls(VTI="Stocks", BND="Bonds", GLD="Commodities")

    result = aggregate(positions, classifications)

    from collections import defaultdict

    gen_totals: dict[str, float] = defaultdict(float)
    for contrib in _per_position_contributions(positions, classifications):
        gen_totals[contrib.ac_bucket] += contrib.dollars

    for s in result.by_asset_class:
        if s.value > 0:
            assert abs(gen_totals[s.name] - s.value) < 1e-6, (
                f"{s.name}: aggregate={s.value}, generator={gen_totals[s.name]}"
            )


def test_generator_sums_with_seed_vti() -> None:
    positions = [_pos("VTI", 50000.0)]
    classifications = load_classifications()

    result = aggregate(positions, classifications)
    equity = next(s for s in result.by_asset_class if s.name == "Stocks")

    from collections import defaultdict

    gen_totals: dict[str, float] = defaultdict(float)
    for contrib in _per_position_contributions(positions, classifications):
        gen_totals[contrib.ac_bucket] += contrib.dollars

    assert abs(gen_totals["Stocks"] - equity.value) < 0.01


def test_positions_for_slice_total_matches_aggregate_l1() -> None:
    positions = [
        _pos("VTI", 60000.0, account_id=1),
        _pos("BND", 30000.0, account_id=1),
        _pos("GLD", 10000.0, account_id=1),
    ]
    classifications = _cls(VTI="Stocks", BND="Bonds", GLD="Commodities")

    result = aggregate(positions, classifications)
    equity_slice = next(s for s in result.by_asset_class if s.name == "Stocks")

    sr = positions_for_slice(
        positions,
        classifications,
        asset_class="Stocks",
        portfolio_total=result.total,
    )

    assert abs(sr.total - equity_slice.value) < 1.0, (
        f"positions_for_slice total={sr.total}, aggregate equity={equity_slice.value}"
    )


def test_positions_for_slice_total_matches_aggregate_l2() -> None:
    positions = [
        _pos("MYSTOCK", 40000.0, account_id=1),
        _pos("INTLSTOCK", 20000.0, account_id=1),
    ]
    classifications = {
        "MYSTOCK": _one("MYSTOCK", "Stocks", "US Stocks"),
        "INTLSTOCK": _one("INTLSTOCK", "Stocks", "International Developed"),
    }

    result = aggregate(positions, classifications)
    equity_slice = next(s for s in result.by_asset_class if s.name == "Stocks")
    us_sc = next((c for c in equity_slice.children if c.name == "US Stocks"), None)
    assert us_sc is not None

    sr = positions_for_slice(
        positions,
        classifications,
        asset_class="Stocks",
        l2="US Stocks",
        portfolio_total=result.total,
    )

    assert abs(sr.total - us_sc.value) < 1.0


def test_positions_for_slice_multiple_accounts_same_ticker() -> None:
    positions = [
        _pos("VTI", 30000.0, account_id=1),
        _pos("VTI", 20000.0, account_id=2),
    ]
    classifications = _cls(VTI="Stocks")

    sr = positions_for_slice(
        positions,
        classifications,
        asset_class="Stocks",
        portfolio_total=50000.0,
        account_names={1: "Schwab", 2: "Fidelity"},
    )

    assert len(sr.positions) == 2
    names = {p.account_name for p in sr.positions}
    assert names == {"Schwab", "Fidelity"}
    assert abs(sr.total - 50000.0) < 1e-6


def test_multi_bucket_partial_and_weighted() -> None:
    positions = [_pos("MYFUND", 100000.0, account_id=1)]
    w_t = 0.4 * 0.67
    w_c = 0.4 * 0.33
    classifications = {
        "MYFUND": ClassificationEntry(
            ticker="MYFUND",
            buckets=(
                BucketEntry("Stocks", "US Stocks", 0.6),
                BucketEntry("Bonds", "US Treasury", w_t),
                BucketEntry("Bonds", "US Corporate", w_c),
            ),
            source="yaml",
        )
    }

    sr_equity = positions_for_slice(
        positions,
        classifications,
        asset_class="Stocks",
        portfolio_total=100000.0,
    )
    sr_fi = positions_for_slice(
        positions,
        classifications,
        asset_class="Bonds",
        portfolio_total=100000.0,
    )

    assert len(sr_equity.positions) == 1
    assert abs(sr_equity.positions[0].contributing_value - 60000.0) < 1.0
    assert sr_equity.positions[0].is_partial is True

    assert len(sr_fi.positions) == 1
    assert abs(sr_fi.positions[0].contributing_value - 40000.0) < 1.0
    assert sr_fi.positions[0].is_partial is True

    assert abs(sr_equity.total + sr_fi.total - 100000.0) < 1.0


def test_direct_ticker_full_value_not_partial() -> None:
    positions = [_pos("VTI", 50000.0, account_id=1)]
    classifications = {"VTI": _one("VTI", "Stocks", "US Stocks", source="user")}

    sr = positions_for_slice(
        positions,
        classifications,
        asset_class="Stocks",
        portfolio_total=50000.0,
    )

    assert len(sr.positions) == 1
    assert abs(sr.positions[0].contributing_value - 50000.0) < 1e-6
    assert sr.positions[0].is_partial is False


def test_user_source_on_slice_row() -> None:
    positions = [_pos("VTI", 40000.0, account_id=1)]
    classifications = {"VTI": _one("VTI", "Stocks", "US Stocks", source="user")}

    sr = positions_for_slice(
        positions,
        classifications,
        asset_class="Stocks",
        portfolio_total=40000.0,
    )

    assert len(sr.positions) == 1
    assert sr.positions[0].classification_source == "user"


def _seed_portfolio(db: Session, account: Account) -> None:
    db.add_all(
        [
            Position(
                account_id=account.id,
                ticker="VTI",
                shares=1.0,
                market_value=60000.0,
                as_of=datetime.now(UTC),
                source="paste",
            ),
            Position(
                account_id=account.id,
                ticker="BND",
                shares=1.0,
                market_value=40000.0,
                as_of=datetime.now(UTC),
                source="paste",
            ),
        ]
    )
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

    r = client.get(
        "/api/allocation/positions/Stocks?l2=not_a_subclass",
        headers=auth_headers,
    )
    assert r.status_code == 400


def test_endpoint_empty_class_returns_200_empty_list(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.get("/api/allocation/positions/Stocks", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["asset_class"] == "Stocks"
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
    equity_slice = next(s for s in alloc["by_asset_class"] if s["name"] == "Stocks")

    drill = client.get("/api/allocation/positions/Stocks", headers=auth_headers).json()

    assert drill["asset_class"] == "Stocks"
    assert drill["l2"] is None
    assert len(drill["positions"]) >= 1
    contrib_sum = sum(p["contributing_value"] for p in drill["positions"])
    assert abs(contrib_sum - equity_slice["value"]) < 1.0


def test_endpoint_l2_filter(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()

    test_db.add_all(
        [
            Position(
                account_id=account.id,
                ticker="MYUS",
                shares=1.0,
                market_value=40000.0,
                as_of=datetime.now(UTC),
                source="paste",
            ),
            Position(
                account_id=account.id,
                ticker="MYINTL",
                shares=1.0,
                market_value=20000.0,
                as_of=datetime.now(UTC),
                source="paste",
            ),
        ]
    )
    c1 = Classification(ticker="MYUS", source="user")
    c2 = Classification(ticker="MYINTL", source="user")
    test_db.add_all([c1, c2])
    test_db.flush()
    test_db.add_all(
        [
            ClassificationBucket(
                ticker="MYUS", sort_order=0, asset_class="Stocks", sub_class="US Stocks", weight=1.0
            ),
            ClassificationBucket(
                ticker="MYINTL",
                sort_order=0,
                asset_class="Stocks",
                sub_class="International Developed",
                weight=1.0,
            ),
        ]
    )
    test_db.commit()

    drill = client.get(
        "/api/allocation/positions/Stocks?l2=US%20Stocks",
        headers=auth_headers,
    ).json()

    assert drill["l2"] == "US Stocks"
    tickers = {p["ticker"] for p in drill["positions"]}
    assert "MYUS" in tickers
    assert "MYINTL" not in tickers

    alloc = client.get("/api/allocation", headers=auth_headers).json()
    equity = next(s for s in alloc["by_asset_class"] if s["name"] == "Stocks")
    sub = next((c for c in equity["children"] if c["name"] == "US Stocks"), None)
    assert sub is not None
    contrib_sum = sum(p["contributing_value"] for p in drill["positions"])
    assert abs(contrib_sum - sub["value"]) < 1.0


def test_endpoint_l2_with_ampersand_in_name(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # "Cash & Savings" contains an & — ensure properly-encoded requests succeed.
    # Regression: the frontend SWR key previously interpolated l2 unencoded,
    # causing the browser to split "?l2=Cash & Savings" at the & and send
    # only l2="Cash " (trailing space), which triggered a 400.
    account = Account(label="CashTest", type="bank")
    test_db.add(account)
    test_db.commit()

    test_db.add(
        Position(
            account_id=account.id,
            ticker="CASHPOS",
            shares=1.0,
            market_value=10000.0,
            as_of=datetime.now(UTC),
            source="paste",
        )
    )
    c = Classification(ticker="CASHPOS", source="user")
    test_db.add(c)
    test_db.flush()
    test_db.add(
        ClassificationBucket(
            ticker="CASHPOS", sort_order=0, asset_class="Cash", sub_class="Cash & Savings", weight=1.0
        )
    )
    test_db.commit()

    # TestClient / httpx encodes params correctly: ?l2=Cash+%26+Savings
    r = client.get(
        "/api/allocation/positions/Cash",
        params={"l2": "Cash & Savings"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["l2"] == "Cash & Savings"
    tickers = {p["ticker"] for p in body["positions"]}
    assert "CASHPOS" in tickers


def test_endpoint_requires_auth(client: TestClient) -> None:
    r = client.get("/api/allocation/positions/Stocks")
    assert r.status_code == 401


def test_endpoint_positions_sorted_by_value_desc(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()

    test_db.add_all(
        [
            Position(
                account_id=account.id,
                ticker="VTI",
                shares=1.0,
                market_value=60000.0,
                as_of=datetime.now(UTC),
                source="paste",
            ),
            Position(
                account_id=account.id,
                ticker="VOO",
                shares=1.0,
                market_value=20000.0,
                as_of=datetime.now(UTC),
                source="paste",
            ),
        ]
    )
    test_db.commit()

    drill = client.get("/api/allocation/positions/Stocks", headers=auth_headers).json()
    values = [p["contributing_value"] for p in drill["positions"]]
    assert values == sorted(values, reverse=True)
