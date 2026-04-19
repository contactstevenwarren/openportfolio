"""Tests for M3 position endpoints: list, patch, delete.

Commit flow lives in test_commit.py; this file covers the lifecycle
after a position lands in the DB.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Position, Provenance


def _seed_position(
    db: Session,
    ticker: str = "VTI",
    shares: float = 10.0,
    market_value: float | None = 5000.0,
    cost_basis: float | None = 4800.0,
) -> Position:
    account = db.query(Account).first() or Account(label="Default", type="brokerage")
    if account.id is None:
        db.add(account)
        db.flush()
    position = Position(
        account_id=account.id,
        ticker=ticker,
        shares=shares,
        cost_basis=cost_basis,
        market_value=market_value,
        as_of=datetime.now(UTC),
        source="paste",
    )
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


# ---- GET /api/positions --------------------------------------------------


def test_list_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/positions")
    assert r.status_code == 401


def test_list_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/positions", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_list_returns_positions(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    _seed_position(test_db, ticker="VTI")
    _seed_position(test_db, ticker="BND", market_value=3000.0)
    r = client.get("/api/positions", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    tickers = [p["ticker"] for p in body]
    assert tickers == ["VTI", "BND"]  # ordered by id


# ---- PATCH /api/positions/{id} -------------------------------------------


def test_patch_requires_admin_token(client: TestClient, test_db: Session) -> None:
    p = _seed_position(test_db)
    r = client.patch(f"/api/positions/{p.id}", json={"shares": 20.0})
    assert r.status_code == 401


def test_patch_unknown_returns_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.patch("/api/positions/999", json={"shares": 1.0}, headers=auth_headers)
    assert r.status_code == 404


def test_patch_updates_shares(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    p = _seed_position(test_db, shares=10.0)
    r = client.patch(
        f"/api/positions/{p.id}", json={"shares": 15.0}, headers=auth_headers
    )
    assert r.status_code == 200
    assert r.json()["shares"] == 15.0
    test_db.refresh(p)
    assert p.shares == 15.0


def test_patch_hsa_cash_split_use_case(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # HSA statement shows a single $10k cash sleeve. User overrides it to
    # reflect the invested/uninvested split by editing market_value.
    p = _seed_position(
        test_db, ticker="HSA_CASH:fidelity", market_value=10000.0, cost_basis=10000.0
    )
    r = client.patch(
        f"/api/positions/{p.id}",
        json={"market_value": 2500.0},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["market_value"] == 2500.0


def test_patch_records_override_provenance(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    p = _seed_position(test_db)
    r = client.patch(
        f"/api/positions/{p.id}",
        json={"market_value": 7500.0, "cost_basis": 6000.0},
        headers=auth_headers,
    )
    assert r.status_code == 200
    overrides = (
        test_db.query(Provenance)
        .filter_by(entity_type="position", entity_id=p.id, source="override")
        .all()
    )
    fields = {row.field for row in overrides}
    assert fields == {"market_value", "cost_basis"}
    for row in overrides:
        assert row.confidence == 1.0
        assert row.llm_span is None


def test_patch_empty_body_is_noop(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    p = _seed_position(test_db, shares=10.0)
    r = client.patch(f"/api/positions/{p.id}", json={}, headers=auth_headers)
    assert r.status_code == 200
    test_db.refresh(p)
    assert p.shares == 10.0
    assert (
        test_db.query(Provenance)
        .filter_by(entity_id=p.id, source="override")
        .count()
        == 0
    )


# ---- DELETE /api/positions/{id} ------------------------------------------


def test_delete_requires_admin_token(client: TestClient, test_db: Session) -> None:
    p = _seed_position(test_db)
    r = client.delete(f"/api/positions/{p.id}")
    assert r.status_code == 401


def test_delete_unknown_returns_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.delete("/api/positions/999", headers=auth_headers)
    assert r.status_code == 404


def test_delete_removes_position(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    p = _seed_position(test_db)
    position_id = p.id
    r = client.delete(f"/api/positions/{position_id}", headers=auth_headers)
    assert r.status_code == 204
    test_db.expire_all()
    assert test_db.get(Position, position_id) is None


def test_delete_preserves_provenance_audit_trail(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # Commit via API so provenance rows are written.
    commit_body = {
        "source": "paste:test",
        "positions": [
            {
                "ticker": "VTI",
                "shares": 10.0,
                "cost_basis": 5000.0,
                "market_value": 6000.0,
                "confidence": 0.98,
                "source_span": "VTI 10 $6,000",
            }
        ],
    }
    r = client.post("/api/positions/commit", json=commit_body, headers=auth_headers)
    position_id = r.json()["position_ids"][0]
    assert (
        test_db.query(Provenance).filter_by(entity_id=position_id).count() == 3
    )

    r = client.delete(f"/api/positions/{position_id}", headers=auth_headers)
    assert r.status_code == 204
    # Provenance rows intentionally survive as an audit trail.
    assert (
        test_db.query(Provenance).filter_by(entity_id=position_id).count() == 3
    )


# ---- manual-entry integration (synthetic tickers) ------------------------


def test_manual_realestate_commit_and_classify(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # Manual entry uses the existing /commit endpoint with source="manual".
    body = {
        "source": "manual",
        "positions": [
            {
                "ticker": "REALESTATE:123Main",
                "shares": 1.0,
                "cost_basis": 400000.0,
                "market_value": 650000.0,
                "confidence": 1.0,
                "source_span": "",
            }
        ],
    }
    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201

    r = client.get("/api/allocation", headers=auth_headers)
    body = r.json()
    names = {s["name"] for s in body["by_asset_class"]}
    assert "real_estate" in names
    assert body["unclassified_tickers"] == []
