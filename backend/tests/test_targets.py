"""API tests for GET/PUT /api/targets (v0.2)."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Position, Target
from tests.db_helpers import seed_user_classification


def _position(account_id: int, ticker: str, market_value: float) -> Position:
    return Position(
        account_id=account_id,
        ticker=ticker,
        shares=1.0,
        market_value=market_value,
        as_of=datetime.now(UTC),
        source="paste",
    )


def test_get_targets_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/targets", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"root": [], "groups": {}}


def test_get_targets_requires_auth(client: TestClient) -> None:
    assert client.get("/api/targets").status_code == 401


def test_put_round_trip_root_only(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            _position(account.id, "VTI", 60_000.0),
            _position(account.id, "BND", 40_000.0),
        ]
    )
    test_db.commit()

    body = {
        "root": [
            {"path": "Stocks", "pct": 55.0},
            {"path": "Bonds", "pct": 45.0},
        ],
        "groups": {},
    }
    pr = client.put("/api/targets", headers=auth_headers, json=body)
    assert pr.status_code == 200
    root_out = pr.json()["root"]
    assert sorted(root_out, key=lambda r: r["path"]) == sorted(
        body["root"], key=lambda r: r["path"]
    )
    assert test_db.query(Target).count() == 2

    gr = client.get("/api/targets", headers=auth_headers)
    assert gr.status_code == 200
    assert sorted(gr.json()["root"], key=lambda r: r["path"]) == sorted(
        body["root"], key=lambda r: r["path"]
    )


def test_put_rejects_bad_sum(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            _position(account.id, "VTI", 60_000.0),
            _position(account.id, "BND", 40_000.0),
        ]
    )
    test_db.commit()

    body = {
        "root": [
            {"path": "Stocks", "pct": 50.0},
            {"path": "Bonds", "pct": 40.0},
        ],
        "groups": {},
    }
    r = client.put("/api/targets", headers=auth_headers, json=body)
    assert r.status_code == 422


def test_put_clear_targets(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 10_000.0))
    test_db.commit()

    client.put(
        "/api/targets",
        headers=auth_headers,
        json={"root": [{"path": "Stocks", "pct": 100.0}], "groups": {}},
    )
    assert test_db.query(Target).count() == 1

    r = client.put(
        "/api/targets", headers=auth_headers, json={"root": [], "groups": {}}
    )
    assert r.status_code == 200
    assert r.json() == {"root": [], "groups": {}}
    assert test_db.query(Target).count() == 0


def test_put_equity_group_requires_all_sub_classes(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    seed_user_classification(test_db, "EUS", "Stocks", "US Stocks")
    seed_user_classification(test_db, "EINT", "Stocks", "International Developed")
    test_db.add_all(
        [
            _position(account.id, "EUS", 50_000.0),
            _position(account.id, "EINT", 50_000.0),
        ]
    )
    test_db.commit()

    bad = {
        "root": [],
        "groups": {"Stocks": [{"path": "Stocks.US Stocks", "pct": 100.0}]},
    }
    assert client.put("/api/targets", headers=auth_headers, json=bad).status_code == 422

    ok = {
        "root": [],
        "groups": {
            "Stocks": [
                {"path": "Stocks.US Stocks", "pct": 50.0},
                {"path": "Stocks.International Developed", "pct": 50.0},
            ]
        },
    }
    assert client.put("/api/targets", headers=auth_headers, json=ok).status_code == 200


def test_put_rejects_targets_when_portfolio_empty(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    body = {"root": [{"path": "Stocks", "pct": 100.0}], "groups": {}}
    r = client.put("/api/targets", headers=auth_headers, json=body)
    assert r.status_code == 422


def test_put_duplicate_path(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 10_000.0))
    test_db.commit()

    # Two rows with the same path in one group
    body2 = {
        "root": [],
        "groups": {
            "Stocks": [
                {"path": "Stocks.US Stocks", "pct": 50.0},
                {"path": "Stocks.US Stocks", "pct": 50.0},
            ]
        },
    }
    assert client.put("/api/targets", headers=auth_headers, json=body2).status_code == 422


def test_allocation_includes_drift_fields(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            _position(account.id, "VTI", 60_000.0),
            _position(account.id, "BND", 40_000.0),
        ]
    )
    test_db.commit()
    client.put(
        "/api/targets",
        headers=auth_headers,
        json={
            "root": [
                {"path": "Stocks", "pct": 55.0},
                {"path": "Bonds", "pct": 45.0},
            ],
            "groups": {},
        },
    )

    body = client.get("/api/allocation", headers=auth_headers).json()
    assert "max_drift" in body
    assert body["max_drift"] is not None
    # Default thresholds: tolerance=3, act=5, urgent=10. |drift|=5 lands
    # at the boundary of watch (tolerance < |d| <= act).
    assert body["max_drift_band"] == "watch"
    by = {s["name"]: s for s in body["by_asset_class"]}
    assert by["Stocks"]["target_pct"] == 55.0
    assert abs(by["Stocks"]["drift_pct"] - 5.0) < 1e-3


def test_allocation_includes_drift_thresholds(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 10_000.0))
    test_db.commit()

    body = client.get("/api/allocation", headers=auth_headers).json()
    assert body["drift_thresholds"] == {
        "tolerance_pct": 3,
        "act_pct": 5,
        "urgent_pct": 10,
    }


def test_put_rejects_fractional_pct(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """Integer-only pct: Pydantic rejects fractional floats at parse time."""
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 10_000.0))
    test_db.commit()

    body = {
        "root": [{"path": "Stocks", "pct": 53.8}],
        "groups": {},
    }
    r = client.put("/api/targets", headers=auth_headers, json=body)
    assert r.status_code == 422


def test_put_accepts_integer_boundaries(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """pct = 0 / 100 are valid, and sum == exactly 100 passes."""
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            _position(account.id, "VTI", 30_000.0),
            _position(account.id, "BND", 70_000.0),
        ]
    )
    test_db.commit()

    body = {
        "root": [
            {"path": "Stocks", "pct": 30},
            {"path": "Bonds", "pct": 70},
        ],
        "groups": {},
    }
    r = client.put("/api/targets", headers=auth_headers, json=body)
    assert r.status_code == 200
    rows = r.json()["root"]
    assert all(isinstance(row["pct"], int) for row in rows)
    assert sum(row["pct"] for row in rows) == 100


def test_put_aspirational_target_unfunded_class(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """Aspirational targets: user holds equity only but sets crypto target > 0.
    Backend should accept (issubset relaxation) and persist the row.
    """
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position(account.id, "VTI", 90_000.0))
    test_db.commit()

    body = {
        "root": [
            {"path": "Stocks", "pct": 90},
            {"path": "Crypto", "pct": 10},
        ],
        "groups": {},
    }
    pr = client.put("/api/targets", headers=auth_headers, json=body)
    assert pr.status_code == 200

    gr = client.get("/api/targets", headers=auth_headers)
    root_by_path = {r["path"]: r["pct"] for r in gr.json()["root"]}
    assert root_by_path["Crypto"] == 10
    assert root_by_path["Stocks"] == 90


def test_put_group_targets_sum_to_100_of_parent(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """Mixed portfolio: group targets sum to 100 (% of parent)."""
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    seed_user_classification(test_db, "EUS", "Stocks", "US Stocks")
    seed_user_classification(test_db, "EINT", "Stocks", "International Developed")
    test_db.add_all(
        [
            _position(account.id, "EUS", 30_000.0),
            _position(account.id, "EINT", 30_000.0),
            _position(account.id, "BND", 40_000.0),
        ]
    )
    test_db.commit()

    ok = {
        "root": [],
        "groups": {
            "Stocks": [
                {"path": "Stocks.US Stocks", "pct": 60},
                {"path": "Stocks.International Developed", "pct": 40},
            ]
        },
    }
    assert client.put("/api/targets", headers=auth_headers, json=ok).status_code == 200

    bad = {
        "root": [],
        "groups": {
            "Stocks": [
                {"path": "Stocks.US Stocks", "pct": 30},
                {"path": "Stocks.International Developed", "pct": 20},
            ]
        },
    }
    assert client.put("/api/targets", headers=auth_headers, json=bad).status_code == 422


def test_put_fi_group_requires_all_sub_classes(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """Multi-bucket FI portfolio: group targets must cover every funded sub_class."""
    account = Account(label="T", type="brokerage")
    test_db.add(account)
    test_db.commit()
    seed_user_classification(test_db, "BUS", "Bonds", "US Treasury")
    seed_user_classification(test_db, "BINT", "Bonds", "International Bonds")
    test_db.add_all(
        [
            _position(account.id, "BUS", 60_000.0),
            _position(account.id, "BINT", 40_000.0),
        ]
    )
    test_db.commit()

    # Missing intl slice → should fail.
    bad = {
        "root": [],
        "groups": {
            "Bonds": [{"path": "Bonds.US Treasury", "pct": 100}]
        },
    }
    assert client.put("/api/targets", headers=auth_headers, json=bad).status_code == 422

    # Both sub_class slices covered, sum to 100 → should succeed.
    ok = {
        "root": [],
        "groups": {
            "Bonds": [
                {"path": "Bonds.US Treasury", "pct": 60},
                {"path": "Bonds.International Bonds", "pct": 40},
            ]
        },
    }
    assert client.put("/api/targets", headers=auth_headers, json=ok).status_code == 200
