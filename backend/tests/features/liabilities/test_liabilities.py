"""Tests for v0.1.7 liability tracking.

Covers:
- CRUD endpoints (create, list, patch, delete)
- Provenance row written on POST and on balance-changing PATCH only
- Snapshot written on POST, balance-changing PATCH, as_of-changing PATCH, DELETE
- No snapshot on label-only PATCH (matches patch_account pattern)
- /api/allocation returns correct assets_total / liabilities_total / net_worth
- balance < 0 rejected by server
- GET /api/export includes liabilities
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Provenance, Snapshot


# ── helpers ─────────────────────────────────────────────────────────────────


def _create_liability(
    client: TestClient,
    auth_headers: dict[str, str],
    *,
    label: str = "Mortgage",
    kind: str = "mortgage",
    balance: float = 300_000.0,
    as_of: str | None = None,
    notes: str | None = None,
) -> dict:
    if as_of is None:
        as_of = datetime.now(UTC).isoformat()
    body: dict = {"label": label, "kind": kind, "balance": balance, "as_of": as_of}
    if notes is not None:
        body["notes"] = notes
    r = client.post("/api/liabilities", json=body, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── auth guard ───────────────────────────────────────────────────────────────


def test_list_requires_auth(client: TestClient) -> None:
    assert client.get("/api/liabilities").status_code == 401


def test_create_requires_auth(client: TestClient) -> None:
    assert client.post("/api/liabilities", json={}).status_code == 401


# ── CRUD round-trip ──────────────────────────────────────────────────────────


def test_list_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/liabilities", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create_liability(client, auth_headers, label="Mortgage", balance=300_000)
    assert created["label"] == "Mortgage"
    assert created["kind"] == "mortgage"
    assert created["balance"] == 300_000.0
    assert created["source"] == "manual"
    assert created["id"] > 0

    listed = client.get("/api/liabilities", headers=auth_headers).json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]


def test_list_sorted_by_as_of_desc(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _create_liability(
        client, auth_headers, label="Old", as_of="2025-01-01T00:00:00+00:00"
    )
    _create_liability(
        client, auth_headers, label="New", as_of="2026-01-01T00:00:00+00:00"
    )
    listed = client.get("/api/liabilities", headers=auth_headers).json()
    assert listed[0]["label"] == "New"
    assert listed[1]["label"] == "Old"


def test_patch_label_only(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    created = _create_liability(client, auth_headers)
    snapshot_count_before = test_db.query(Snapshot).count()
    provenance_count_before = test_db.query(Provenance).count()

    r = client.patch(
        f"/api/liabilities/{created['id']}",
        json={"label": "Primary mortgage"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["label"] == "Primary mortgage"

    # Label-only patch: no snapshot, no new provenance row
    assert test_db.query(Snapshot).count() == snapshot_count_before
    assert test_db.query(Provenance).count() == provenance_count_before


def test_patch_balance_writes_provenance_and_snapshot(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    created = _create_liability(client, auth_headers, balance=300_000)
    snapshot_count_before = test_db.query(Snapshot).count()
    provenance_count_before = test_db.query(Provenance).count()

    r = client.patch(
        f"/api/liabilities/{created['id']}",
        json={"balance": 295_000.0},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["balance"] == 295_000.0

    assert test_db.query(Snapshot).count() == snapshot_count_before + 1
    prov_rows = (
        test_db.query(Provenance)
        .filter(
            Provenance.entity_type == "liability",
            Provenance.entity_id == created["id"],
            Provenance.field == "balance",
            Provenance.source == "override",
        )
        .all()
    )
    assert len(prov_rows) == 1
    assert test_db.query(Provenance).count() == provenance_count_before + 1


def test_patch_as_of_only_writes_snapshot_not_provenance(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    created = _create_liability(client, auth_headers)
    snapshot_count_before = test_db.query(Snapshot).count()
    provenance_count_before = test_db.query(Provenance).count()

    r = client.patch(
        f"/api/liabilities/{created['id']}",
        json={"as_of": "2025-06-01T00:00:00+00:00"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert test_db.query(Snapshot).count() == snapshot_count_before + 1
    # as_of change doesn't write provenance (matches patch_account convention)
    assert test_db.query(Provenance).count() == provenance_count_before


def test_patch_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.patch("/api/liabilities/9999", json={"label": "x"}, headers=auth_headers)
    assert r.status_code == 404


def test_delete(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    created = _create_liability(client, auth_headers)
    snapshot_count_before = test_db.query(Snapshot).count()

    r = client.delete(
        f"/api/liabilities/{created['id']}", headers=auth_headers
    )
    assert r.status_code == 204

    listed = client.get("/api/liabilities", headers=auth_headers).json()
    assert listed == []
    assert test_db.query(Snapshot).count() == snapshot_count_before + 1


def test_delete_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.delete("/api/liabilities/9999", headers=auth_headers)
    assert r.status_code == 404


# ── validation ───────────────────────────────────────────────────────────────


def test_negative_balance_rejected_on_create(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/liabilities",
        json={
            "label": "Bad",
            "kind": "other",
            "balance": -100.0,
            "as_of": datetime.now(UTC).isoformat(),
        },
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_negative_balance_rejected_on_patch(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = _create_liability(client, auth_headers)
    r = client.patch(
        f"/api/liabilities/{created['id']}",
        json={"balance": -1.0},
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_free_form_kind_accepted(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = _create_liability(client, auth_headers, kind="heloc", balance=50_000)
    assert created["kind"] == "heloc"


# ── provenance on POST ───────────────────────────────────────────────────────


def test_create_writes_provenance_for_balance(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    created = _create_liability(client, auth_headers, balance=100_000)
    prov = (
        test_db.query(Provenance)
        .filter(
            Provenance.entity_type == "liability",
            Provenance.entity_id == created["id"],
            Provenance.field == "balance",
        )
        .first()
    )
    assert prov is not None
    assert prov.source == "manual"
    assert prov.confidence == 1.0


# ── snapshot on POST ─────────────────────────────────────────────────────────


def test_create_writes_snapshot(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    count_before = test_db.query(Snapshot).count()
    _create_liability(client, auth_headers, balance=200_000)
    assert test_db.query(Snapshot).count() == count_before + 1


# ── allocation endpoint reflects liabilities ────────────────────────────────


def test_allocation_net_worth_subtracts_liabilities(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # No positions, no liabilities — all zeros
    alloc = client.get("/api/allocation", headers=auth_headers).json()
    assert alloc["assets_total"] == 0.0
    assert alloc["liabilities_total"] == 0.0
    assert alloc["net_worth"] == 0.0


def test_allocation_with_liability(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _create_liability(client, auth_headers, balance=100_000)
    alloc = client.get("/api/allocation", headers=auth_headers).json()
    assert alloc["liabilities_total"] == 100_000.0
    # No positions so assets_total == 0; net_worth should be negative
    assert alloc["net_worth"] == alloc["assets_total"] - alloc["liabilities_total"]


# ── export includes liabilities ──────────────────────────────────────────────


def test_export_includes_liabilities(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _create_liability(client, auth_headers, label="Student loan", kind="student_loan", balance=25_000)
    export = client.get("/api/export", headers=auth_headers).json()
    assert "liabilities" in export
    assert len(export["liabilities"]) == 1
    assert export["liabilities"][0]["label"] == "Student loan"
    assert export["liabilities"][0]["balance"] == 25_000.0
