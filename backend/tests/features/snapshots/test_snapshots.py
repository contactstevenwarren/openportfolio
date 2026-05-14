"""Tests for GET /api/snapshots/earliest."""

import json
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Snapshot


def test_earliest_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/snapshots/earliest")
    assert r.status_code == 401


def test_earliest_empty_db(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/snapshots/earliest", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() is None


def test_earliest_returns_oldest_snapshot(
    client: TestClient,
    test_db: Session,
    auth_headers: dict[str, str],
) -> None:
    older = Snapshot(
        taken_at=datetime(2026, 1, 1, tzinfo=UTC),
        net_worth_usd=100_000.0,
        payload_json=json.dumps({"total_usd": 90_000.0}),
    )
    newer = Snapshot(
        taken_at=datetime(2026, 4, 1, tzinfo=UTC),
        net_worth_usd=120_000.0,
        payload_json=json.dumps({"total_usd": 110_000.0}),
    )
    test_db.add_all([older, newer])
    test_db.commit()

    r = client.get("/api/snapshots/earliest", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body is not None
    assert body["net_worth_usd"] == 100_000.0
    assert body["total_usd"] == 90_000.0
    # taken_at should be the older snapshot
    assert "2026-01-01" in body["taken_at"]


def test_list_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/snapshots/")
    assert r.status_code == 401


def test_list_empty_db(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/snapshots/", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_list_returns_snapshots_chronological(
    client: TestClient,
    test_db: Session,
    auth_headers: dict[str, str],
) -> None:
    payload_a = {
        "total_usd": 50_000.0,
        "by_asset_class": {
            "Stocks": {"value": 40_000.0, "pct": 80.0},
            "Cash": {"value": 10_000.0, "pct": 20.0},
        },
    }
    payload_b = {
        "total_usd": 60_000.0,
        "by_asset_class": {
            "Stocks": {"value": 45_000.0, "pct": 75.0},
            "Cash": {"value": 15_000.0, "pct": 25.0},
        },
    }
    older = Snapshot(
        taken_at=datetime(2026, 1, 1, tzinfo=UTC),
        net_worth_usd=100_000.0,
        payload_json=json.dumps(payload_a),
    )
    newer = Snapshot(
        taken_at=datetime(2026, 4, 1, tzinfo=UTC),
        net_worth_usd=120_000.0,
        payload_json=json.dumps(payload_b),
    )
    test_db.add_all([newer, older])
    test_db.commit()

    r = client.get("/api/snapshots/", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    assert body[0]["taken_at"] <= body[1]["taken_at"]
    assert body[0]["investable_total_usd"] == 50_000.0
    assert body[0]["by_asset_class"]["Stocks"] == 40_000.0
    assert body[0]["by_asset_class"]["Cash"] == 10_000.0
    assert body[1]["investable_total_usd"] == 60_000.0



def test_list_respects_limit(
    client: TestClient,
    test_db: Session,
    auth_headers: dict[str, str],
) -> None:
    for i in range(5):
        test_db.add(
            Snapshot(
                taken_at=datetime(2026, 1, i + 1, tzinfo=UTC),
                net_worth_usd=float(i),
                payload_json=json.dumps({"total_usd": float(i)}),
            )
        )
    test_db.commit()
    r = client.get("/api/snapshots/?limit=2", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2
