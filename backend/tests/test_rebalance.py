"""Unit + endpoint tests for rebalance math (v0.5 M1)."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.allocation import aggregate
from app.classifications import ClassificationEntry
from app.models import Account, Classification, Position, Target
from app.rebalance import compute_new_money, compute_rebalance

MINOR = 1.0


def _pos(ticker: str, mv: float) -> Position:
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
        "C1": ClassificationEntry(
            ticker="C1",
            asset_class="cash",
            sub_class="cash",
            region="US",
        ),
    }


# ------------------------------------------------------------------ math


def test_no_root_targets_empty_moves() -> None:
    result = aggregate(
        [_pos("E1", 60_000.0), _pos("B1", 40_000.0)], _classes()
    )
    out = compute_rebalance(
        result, {"equity.US": 100.0}, drift_minor_pct=MINOR
    )
    assert out.moves == []
    assert out.total == result.total
    assert out.mode == "full"


def test_l1_only_sums_to_zero() -> None:
    result = aggregate(
        [_pos("E1", 60_000.0), _pos("B1", 30_000.0), _pos("C1", 10_000.0)],
        _classes(),
    )
    targets = {"equity": 50.0, "fixed_income": 40.0, "cash": 10.0}
    out = compute_rebalance(result, targets, drift_minor_pct=MINOR)
    assert len(out.moves) == 3
    assert abs(sum(m.delta_usd for m in out.moves)) < 1e-6
    by = {m.path: m for m in out.moves}
    # equity 60% actual vs 50% target -> sell
    assert by["equity"].direction == "sell"
    assert by["equity"].delta_usd < 0
    # fixed_income 30% actual vs 40% -> buy
    assert by["fixed_income"].direction == "buy"
    assert by["fixed_income"].delta_usd > 0
    assert by["cash"].direction == "hold"


def test_l1_plus_l2_equity() -> None:
    result = aggregate(
        [
            _pos("E1", 30_000.0),   # US equity
            _pos("E2", 30_000.0),   # intl equity
            _pos("B1", 40_000.0),
        ],
        _classes(),
    )
    targets = {
        "equity": 50.0,
        "fixed_income": 50.0,
        "equity.US": 40.0,
        "equity.intl_developed": 60.0,
    }
    out = compute_rebalance(result, targets, drift_minor_pct=MINOR)
    eq = next(m for m in out.moves if m.path == "equity")
    assert len(eq.children) == 2
    # L2 deltas inside equity sum to ~0 (both drifts cancel at % of parent).
    assert abs(sum(c.delta_usd for c in eq.children)) < 1e-6
    # parent_total_usd at L2 = equity slice value = 60k.
    for c in eq.children:
        assert abs(c.parent_total_usd - 60_000.0) < 1e-6
    # equity.US: actual=50%, target=40% -> drift 40-50=-10, delta=-10/100*60k=-6k
    us = next(c for c in eq.children if c.path == "equity.US")
    assert abs(us.delta_usd - (-6_000.0)) < 1e-6
    assert us.direction == "sell"


def test_hold_band() -> None:
    # equity 50.5% actual vs 50% target -> drift 0.5%, within minor=1.0
    result = aggregate(
        [_pos("E1", 50_500.0), _pos("B1", 49_500.0)], _classes()
    )
    targets = {"equity": 50.0, "fixed_income": 50.0}
    out = compute_rebalance(result, targets, drift_minor_pct=MINOR)
    eq = next(m for m in out.moves if m.path == "equity")
    # drift -0.5% -> within hold band
    assert eq.direction == "hold"
    # but the dollar delta is small-non-zero (sign may be negative)
    assert eq.delta_usd != 0.0


def test_new_money_gaps_exceed_contribution() -> None:
    # portfolio 100k: equity 40k (40%), FI 60k (60%). Targets equity 60 / FI 40.
    # new_total = 105k. desired equity = 63k (gap 23k), desired FI = 42k (gap 0
    # since 60k > 42k; but gap is max(0, desired-current) = 0). Wait FI is over.
    # Let's use a case where gaps total > contribution: equity 20k (20%),
    # FI 20k (20%), cash 60k (60%); targets 50/40/10.
    result = aggregate(
        [_pos("E1", 20_000.0), _pos("B1", 20_000.0), _pos("C1", 60_000.0)],
        _classes(),
    )
    targets = {"equity": 50.0, "fixed_income": 40.0, "cash": 10.0}
    out = compute_new_money(
        result, targets, contribution_usd=5_000.0, drift_minor_pct=MINOR
    )
    assert out.mode == "new_money"
    assert out.contribution_usd == 5_000.0
    assert abs(sum(m.delta_usd for m in out.moves) - 5_000.0) < 1e-6
    for m in out.moves:
        assert m.delta_usd >= 0.0  # no sells
    # Cash is over target -> gets 0 (gap=0).
    cash = next(m for m in out.moves if m.path == "cash")
    assert cash.delta_usd == 0.0


def test_new_money_contribution_exceeds_gaps_excess_to_under_target_only() -> None:
    """Excess branch: sum(gaps) < contribution, distribute leftover.

    Requires at least one class that stays over target after the
    contribution (otherwise sum(gaps) == contribution when targets sum
    to 100 and cover every class). Tested with partial targets so the
    over-target class can't absorb the excess; the "under" class gets
    its gap plus the full excess.
    """
    from app.schemas import AllocationResult, AllocationSlice

    result = AllocationResult(
        total=100.0,
        by_asset_class=[
            AllocationSlice(name="equity", value=90.0, pct=90.0, children=[]),
            AllocationSlice(name="fixed_income", value=10.0, pct=10.0, children=[]),
        ],
        unclassified_tickers=[],
    )
    # Targets sum to 50 so the total-gap sum is decoupled from contribution.
    # contrib=$40 -> new_total=$140. desired eq=28 (current 90, gap 0),
    # FI=42 (current 10, gap 32). sum gaps=32 < 40. excess=8.
    # eq actual 90 > 20+1=21 -> over (no excess). FI actual 10 <= 30+1=31 ->
    # under. FI gets 32 + 8 = 40. eq gets 0.
    out = compute_new_money(
        result,
        {"equity": 20.0, "fixed_income": 30.0},
        contribution_usd=40.0,
        drift_minor_pct=MINOR,
    )
    by = {m.path: m for m in out.moves}
    assert by["equity"].delta_usd == 0.0
    assert abs(by["fixed_income"].delta_usd - 40.0) < 1e-6
    assert abs(sum(m.delta_usd for m in out.moves) - 40.0) < 1e-6


def test_new_money_l2_hierarchical() -> None:
    # Equity 60k (US 20k, intl 40k), FI 40k. Total 100k.
    # Targets: equity 50, FI 50, equity.US 60, equity.intl_developed 40.
    # Contribution $10k -> new_total 110k.
    # L1 desired: equity 55k (gap 0 since current 60>55), FI 55k (gap 15k).
    # gaps total 15k. contrib 10k < 15 -> gap-proportional.
    # equity gets 0, FI gets 10k. Equity L2 has no buy -> no children (per
    # code: only recurse when buy > 0). Confirm no sells at L1.
    result = aggregate(
        [
            _pos("E1", 20_000.0),
            _pos("E2", 40_000.0),
            _pos("B1", 40_000.0),
        ],
        _classes(),
    )
    targets = {
        "equity": 50.0,
        "fixed_income": 50.0,
        "equity.US": 60.0,
        "equity.intl_developed": 40.0,
    }
    out = compute_new_money(
        result, targets, contribution_usd=10_000.0, drift_minor_pct=MINOR
    )
    eq = next(m for m in out.moves if m.path == "equity")
    fi = next(m for m in out.moves if m.path == "fixed_income")
    assert eq.delta_usd == 0.0
    assert abs(fi.delta_usd - 10_000.0) < 1e-6
    assert eq.children == []  # no L2 recursion when L1 buy is 0

    # Now a case where equity gets L1 buy > 0 so children appear.
    # Reshape: equity 30k, FI 70k. Targets eq 50, FI 50, equity.US 60,
    # equity.intl_developed 40. Contrib $10k -> new_total 110.
    # desired eq 55, FI 55 -> gaps 25, 0 -> 25 > 10 -> gap-proportional.
    # eq gets all $10k, FI gets 0. L2: eq.US current 20k (actual 66.67%),
    # eq.intl current 10k (33.33%). new_parent = 30+10 = 40.
    # desired US 24 (tgt 60), intl 16 (tgt 40). gaps: 4, 6 -> 10. exactly.
    # Both get full gap.
    result2 = aggregate(
        [
            _pos("E1", 20_000.0),
            _pos("E2", 10_000.0),
            _pos("B1", 70_000.0),
        ],
        _classes(),
    )
    out2 = compute_new_money(
        result2, targets, contribution_usd=10_000.0, drift_minor_pct=MINOR
    )
    eq2 = next(m for m in out2.moves if m.path == "equity")
    assert abs(eq2.delta_usd - 10_000.0) < 1e-6
    assert abs(sum(c.delta_usd for c in eq2.children) - eq2.delta_usd) < 1e-6
    us = next(c for c in eq2.children if c.path == "equity.US")
    intl = next(c for c in eq2.children if c.path == "equity.intl_developed")
    assert abs(us.delta_usd - 4_000.0) < 1e-6
    assert abs(intl.delta_usd - 6_000.0) < 1e-6


def test_new_money_invalid_amount() -> None:
    import math

    import pytest

    result = aggregate([_pos("E1", 100.0)], _classes())
    targets = {"equity": 100.0}
    for bad in (-1.0, 0.0, float("nan"), float("inf"), float("-inf")):
        with pytest.raises(ValueError):
            compute_new_money(
                result, targets, contribution_usd=bad, drift_minor_pct=MINOR
            )


def test_zero_total_empty_moves() -> None:
    result = aggregate([], _classes())
    out = compute_rebalance(result, {"equity": 100.0}, drift_minor_pct=MINOR)
    assert out.moves == []
    assert out.total == 0.0


# ------------------------------------------------------------------ endpoint


def _position(account_id: int, ticker: str, market_value: float) -> Position:
    return Position(
        account_id=account_id,
        ticker=ticker,
        shares=1.0,
        market_value=market_value,
        as_of=datetime.now(UTC),
        source="paste",
    )


def test_rebalance_requires_auth(client: TestClient) -> None:
    assert client.get("/api/rebalance").status_code == 401


def test_rebalance_no_targets_empty(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 10_000.0))
    test_db.commit()

    r = client.get("/api/rebalance", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["moves"] == []
    assert body["mode"] == "full"


def test_rebalance_stale_l2_returns_409(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            Classification(
                ticker="EUS",
                asset_class="equity",
                sub_class="us_large_cap",
                region="US",
                source="user",
            ),
            Classification(
                ticker="EINT",
                asset_class="equity",
                sub_class="intl_developed",
                region="intl_developed",
                source="user",
            ),
        ]
    )
    test_db.add_all(
        [
            _position(account.id, "EUS", 50_000.0),
            _position(account.id, "EINT", 50_000.0),
        ]
    )
    test_db.commit()

    put_body = {
        "root": [{"path": "equity", "pct": 100}],
        "groups": {
            "equity": [
                {"path": "equity.US", "pct": 50},
                {"path": "equity.intl_developed", "pct": 50},
            ]
        },
    }
    pr = client.put("/api/targets", headers=auth_headers, json=put_body)
    assert pr.status_code == 200

    # Add a new emerging-markets position -> stale L2 targets.
    test_db.add(
        Classification(
            ticker="EEM",
            asset_class="equity",
            sub_class="emerging",
            region="emerging",
            source="user",
        )
    )
    test_db.add(_position(account.id, "EEM", 20_000.0))
    test_db.commit()

    r = client.get("/api/rebalance", headers=auth_headers)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["error"] == "stale_targets"
    assert detail["asset_class"] == "equity"
    assert "equity.emerging" in detail["missing_paths"]


def test_rebalance_full_returns_tree(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            Classification(
                ticker="EUS",
                asset_class="equity",
                sub_class="us_large_cap",
                region="US",
                source="user",
            ),
            Classification(
                ticker="EINT",
                asset_class="equity",
                sub_class="intl_developed",
                region="intl_developed",
                source="user",
            ),
            Classification(
                ticker="BND",
                asset_class="fixed_income",
                sub_class="us_aggregate",
                region="US",
                source="user",
            ),
        ]
    )
    test_db.add_all(
        [
            _position(account.id, "EUS", 30_000.0),
            _position(account.id, "EINT", 30_000.0),
            _position(account.id, "BND", 40_000.0),
        ]
    )
    test_db.commit()
    pr = client.put(
        "/api/targets",
        headers=auth_headers,
        json={
            "root": [
                {"path": "equity", "pct": 50},
                {"path": "fixed_income", "pct": 50},
            ],
            "groups": {
                "equity": [
                    {"path": "equity.US", "pct": 40},
                    {"path": "equity.intl_developed", "pct": 60},
                ]
            },
        },
    )
    assert pr.status_code == 200

    r = client.get("/api/rebalance", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "full"
    assert body["total"] == 100_000.0
    paths = {m["path"] for m in body["moves"]}
    assert paths == {"equity", "fixed_income"}
    eq = next(m for m in body["moves"] if m["path"] == "equity")
    # equity 60% actual vs 50% target -> sell 10k
    assert eq["direction"] == "sell"
    assert abs(eq["delta_usd"] - (-10_000.0)) < 1e-6
    child_paths = {c["path"] for c in eq["children"]}
    assert child_paths == {"equity.US", "equity.intl_developed"}


def test_new_money_missing_amount_422(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 10_000.0))
    test_db.commit()
    test_db.add(Target(path="equity", pct=100))
    test_db.commit()

    r = client.get("/api/rebalance?mode=new_money", headers=auth_headers)
    assert r.status_code == 422


def test_new_money_bad_amount_422(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 10_000.0))
    test_db.commit()
    test_db.add(Target(path="equity", pct=100))
    test_db.commit()

    for bad in ("0", "-5", "nan", "inf"):
        r = client.get(
            f"/api/rebalance?mode=new_money&amount={bad}", headers=auth_headers
        )
        assert r.status_code == 422, f"amount={bad} expected 422, got {r.status_code}"


def test_new_money_happy_path(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            Classification(
                ticker="EUS",
                asset_class="equity",
                sub_class="us_large_cap",
                region="US",
                source="user",
            ),
            Classification(
                ticker="BND",
                asset_class="fixed_income",
                sub_class="us_aggregate",
                region="US",
                source="user",
            ),
        ]
    )
    test_db.add_all(
        [
            _position(account.id, "EUS", 40_000.0),
            _position(account.id, "BND", 60_000.0),
        ]
    )
    test_db.commit()
    pr = client.put(
        "/api/targets",
        headers=auth_headers,
        json={
            "root": [
                {"path": "equity", "pct": 60},
                {"path": "fixed_income", "pct": 40},
            ],
            "groups": {},
        },
    )
    assert pr.status_code == 200

    r = client.get(
        "/api/rebalance?mode=new_money&amount=10000", headers=auth_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "new_money"
    assert body["contribution_usd"] == 10_000.0
    assert abs(sum(m["delta_usd"] for m in body["moves"]) - 10_000.0) < 1e-6
    for m in body["moves"]:
        assert m["delta_usd"] >= 0.0
