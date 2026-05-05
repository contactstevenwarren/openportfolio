"""Tests for GET /api/export (M5 manual backup path, architecture Privacy + risk #9)."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Position, Provenance


def _seed(db: Session) -> int:
    account = Account(label="Test", type="brokerage")
    db.add(account)
    db.flush()
    position = Position(
        account_id=account.id,
        ticker="VTI",
        shares=10.0,
        cost_basis=5000.0,
        market_value=6000.0,
        as_of=datetime.now(UTC),
        source="paste:test",
    )
    db.add(position)
    db.flush()
    db.add(
        Provenance(
            entity_type="position",
            entity_id=position.id,
            field="shares",
            source="paste:test",
            confidence=0.98,
            llm_span="VTI 10 $6,000",
            captured_at=datetime.now(UTC),
        )
    )
    db.commit()
    return position.id


def test_export_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/export")
    assert r.status_code == 401


def test_export_empty_shape(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.get("/api/export", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["accounts"] == []
    assert body["positions"] == []
    assert body["provenance"] == []
    assert body["snapshots"] == []
    assert body["liabilities"] == []
    assert body["app_version"] == "0.1"
    assert "exported_at" in body


def test_export_includes_seeded_rows(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    position_id = _seed(test_db)
    r = client.get("/api/export", headers=auth_headers)
    body = r.json()

    assert len(body["accounts"]) == 1
    assert body["accounts"][0]["label"] == "Test"

    assert len(body["positions"]) == 1
    assert body["positions"][0]["id"] == position_id
    assert body["positions"][0]["ticker"] == "VTI"

    # Exactly one provenance row (shares).
    assert len(body["provenance"]) == 1
    prov = body["provenance"][0]
    assert prov["field"] == "shares"
    assert prov["source"] == "paste:test"
    assert prov["confidence"] == 0.98


def test_export_excludes_fund_holdings_cache(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Schema shape check: the exported keys don't leak the internal
    # fund_holdings table (it's a rebuildable cache, not user data).
    # v0.1.7: liabilities[] added to the export.
    r = client.get("/api/export", headers=auth_headers)
    keys = set(r.json().keys())
    assert "fund_holdings" not in keys
    assert keys == {
        "exported_at",
        "app_version",
        "accounts",
        "positions",
        "provenance",
        "snapshots",
        "liabilities",
    }
