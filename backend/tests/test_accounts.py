"""Tests for /api/accounts."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Position


def test_list_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/accounts")
    assert r.status_code == 401


def test_create_requires_admin_token(client: TestClient) -> None:
    r = client.post("/api/accounts", json={"label": "IRA"})
    assert r.status_code == 401


def test_list_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/accounts", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list(client: TestClient, auth_headers: dict[str, str]) -> None:
    create = client.post(
        "/api/accounts",
        json={"label": "Fidelity Taxable", "type": "brokerage"},
        headers=auth_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["label"] == "Fidelity Taxable"
    assert body["type"] == "brokerage"
    assert body["id"] > 0

    listed = client.get("/api/accounts", headers=auth_headers).json()
    assert len(listed) == 1
    assert listed[0]["label"] == "Fidelity Taxable"


def test_type_defaults_to_brokerage(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post("/api/accounts", json={"label": "Just a label"}, headers=auth_headers)
    assert r.json()["type"] == "brokerage"


# --- v0.1.5 M2: PATCH + DELETE --------------------------------------------


def test_patch_updates_label_and_type(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/accounts",
        json={"label": "Old", "type": "brokerage"},
        headers=auth_headers,
    ).json()

    r = client.patch(
        f"/api/accounts/{created['id']}",
        json={"label": "New", "type": "hsa"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["label"] == "New"
    assert body["type"] == "hsa"


def test_patch_partial_keeps_unset_fields(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/accounts",
        json={"label": "Label", "type": "brokerage"},
        headers=auth_headers,
    ).json()

    r = client.patch(
        f"/api/accounts/{created['id']}",
        json={"label": "Renamed"},
        headers=auth_headers,
    )
    assert r.json()["label"] == "Renamed"
    assert r.json()["type"] == "brokerage"


def test_patch_404_on_missing(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.patch("/api/accounts/99999", json={"label": "X"}, headers=auth_headers)
    assert r.status_code == 404


def test_delete_cascades_positions(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Doomed", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(
        Position(
            account_id=account.id,
            ticker="VTI",
            shares=1.0,
            market_value=1000.0,
            as_of=datetime.now(UTC),
            source="paste",
        )
    )
    test_db.commit()

    r = client.delete(f"/api/accounts/{account.id}", headers=auth_headers)
    assert r.status_code == 204

    # Account gone and its position cascaded. Using the API (not the
    # test_db session) because the session has the row in its identity
    # map from the earlier add; the API opens a fresh session.
    remaining_accounts = client.get("/api/accounts", headers=auth_headers).json()
    assert remaining_accounts == []
    remaining_positions = client.get("/api/positions", headers=auth_headers).json()
    assert remaining_positions == []


def test_delete_404_on_missing(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.delete("/api/accounts/99999", headers=auth_headers)
    assert r.status_code == 404


def test_patch_and_delete_require_admin_token(client: TestClient) -> None:
    assert client.patch("/api/accounts/1", json={"label": "X"}).status_code == 401
    assert client.delete("/api/accounts/1").status_code == 401
