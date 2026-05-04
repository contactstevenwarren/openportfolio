"""Tests for /api/institutions."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Institution


def test_list_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/institutions")
    assert r.status_code == 401


def test_create_requires_admin_token(client: TestClient) -> None:
    r = client.post("/api/institutions", json={"name": "Fidelity"})
    assert r.status_code == 401


def test_list_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/institutions", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_create_returns_id_and_name(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post("/api/institutions", json={"name": "Vanguard"}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Vanguard"
    assert body["id"] > 0


def test_list_returns_alphabetical(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    for name in ["Vanguard", "Fidelity", "Charles Schwab"]:
        client.post("/api/institutions", json={"name": name}, headers=auth_headers)

    r = client.get("/api/institutions", headers=auth_headers)
    assert r.status_code == 200
    names = [i["name"] for i in r.json()]
    assert names == sorted(names, key=str.lower)


def test_create_dedupes_same_case(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r1 = client.post("/api/institutions", json={"name": "Fidelity"}, headers=auth_headers)
    r2 = client.post("/api/institutions", json={"name": "Fidelity"}, headers=auth_headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]


def test_create_dedupes_different_case(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r1 = client.post("/api/institutions", json={"name": "fidelity"}, headers=auth_headers)
    r2 = client.post("/api/institutions", json={"name": "FIDELITY"}, headers=auth_headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]


def test_create_rejects_empty_name(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post("/api/institutions", json={"name": "   "}, headers=auth_headers)
    assert r.status_code == 422


def test_list_after_create(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    client.post("/api/institutions", json={"name": "Ally Bank"}, headers=auth_headers)
    r = client.get("/api/institutions", headers=auth_headers)
    assert r.status_code == 200
    names = [i["name"] for i in r.json()]
    assert "Ally Bank" in names
