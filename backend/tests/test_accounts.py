"""Tests for /api/accounts."""

from fastapi.testclient import TestClient


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
