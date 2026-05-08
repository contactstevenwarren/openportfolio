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
