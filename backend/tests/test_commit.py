"""Tests for POST /api/positions/commit."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Position, Provenance


def _body(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "source": "paste:fidelity-2026-04-19",
        "positions": [
            {
                "ticker": "VTI",
                "shares": 120.0,
                "cost_basis": 22000.0,
                "market_value": 29438.40,
                "confidence": 0.98,
                "source_span": "VTI 120.000 $29,438.40",
            }
        ],
    }
    base.update(overrides)
    return base


def test_requires_admin_token(client: TestClient) -> None:
    r = client.post("/api/positions/commit", json=_body())
    assert r.status_code == 401


def test_auto_seeds_default_account_on_first_commit(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    assert test_db.query(Account).count() == 0

    r = client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    assert r.status_code == 201

    account = test_db.query(Account).one()
    assert account.label == "Default"
    assert account.type == "brokerage"
    assert r.json()["account_id"] == account.id


def test_uses_explicit_account_id(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Schwab Roth", type="brokerage")
    test_db.add(account)
    test_db.commit()
    body = _body(account_id=account.id)

    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["account_id"] == account.id
    # No "Default" was auto-seeded.
    assert test_db.query(Account).count() == 1


def test_unknown_account_returns_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/positions/commit",
        json=_body(account_id=999),
        headers=auth_headers,
    )
    assert r.status_code == 404


def test_writes_position_fields(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    position_id = r.json()["position_ids"][0]

    p = test_db.get(Position, position_id)
    assert p is not None
    assert p.ticker == "VTI"
    assert p.shares == 120.0
    assert p.cost_basis == 22000.0
    assert p.market_value == 29438.40
    assert p.source == "paste:fidelity-2026-04-19"


def test_provenance_rows_created_per_numeric_field(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    position_id = r.json()["position_ids"][0]

    rows = (
        test_db.query(Provenance)
        .filter_by(entity_type="position", entity_id=position_id)
        .all()
    )
    fields = {row.field for row in rows}
    # shares, cost_basis, market_value. ticker is a label, not a number.
    assert fields == {"shares", "cost_basis", "market_value"}
    for row in rows:
        assert row.source == "paste:fidelity-2026-04-19"
        assert row.confidence == 0.98
        assert row.llm_span == "VTI 120.000 $29,438.40"


def test_provenance_skips_null_fields(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # Vanguard-style row: market_value only, no cost_basis.
    body = {
        "source": "paste:vanguard",
        "positions": [
            {
                "ticker": "BND",
                "shares": 75.0,
                "cost_basis": None,
                "market_value": 5433.75,
                "confidence": 0.95,
                "source_span": "BND 75.0000 $5,433.75",
            }
        ],
    }

    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    position_id = r.json()["position_ids"][0]

    fields = {
        row.field
        for row in test_db.query(Provenance).filter_by(entity_id=position_id).all()
    }
    assert fields == {"shares", "market_value"}


def test_commits_multiple_positions(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    body = {
        "source": "paste:schwab",
        "positions": [
            {
                "ticker": "SPY",
                "shares": 100.0,
                "cost_basis": 48000.0,
                "market_value": 55530.0,
                "confidence": 0.98,
                "source_span": "SPY 100 $55,530",
            },
            {
                "ticker": "QQQ",
                "shares": 50.0,
                "cost_basis": 21200.0,
                "market_value": 24787.5,
                "confidence": 0.98,
                "source_span": "QQQ 50 $24,787.50",
            },
        ],
    }

    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201
    ids = r.json()["position_ids"]
    assert len(ids) == 2
    assert len(set(ids)) == 2  # distinct ids
    tickers = {p.ticker for p in test_db.query(Position).all()}
    assert tickers == {"SPY", "QQQ"}
