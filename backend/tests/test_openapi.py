"""Smoke tests for the OpenAPI schema.

Verifies that the spec is reachable at /api/openapi.json, contains the expected
paths, and documents the X-Admin-Token security scheme so Swagger UI can offer
the Authorize dialog.
"""

import pytest
from fastapi.testclient import TestClient


def test_openapi_json_is_reachable(client: TestClient) -> None:
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    data = r.json()
    assert data.get("openapi", "").startswith("3.")


def test_openapi_documents_admin_token_scheme(client: TestClient) -> None:
    r = client.get("/api/openapi.json")
    data = r.json()
    schemes = data.get("components", {}).get("securitySchemes", {})
    # FastAPI keys the scheme by the class name "APIKeyHeader"; the header
    # name is recorded inside the scheme object.
    assert "APIKeyHeader" in schemes, f"securitySchemes: {list(schemes)}"
    scheme = schemes["APIKeyHeader"]
    assert scheme.get("type") == "apiKey"
    assert scheme.get("in") == "header"
    assert scheme.get("name") == "X-Admin-Token"


@pytest.mark.parametrize("path", [
    "/health",
    "/api/accounts",
    "/api/institutions",
    "/api/positions",
    "/api/positions/commit",
    "/api/allocation",
    "/api/allocation/positions/{asset_class}",
    "/api/snapshots/",
    "/api/snapshots/earliest",
    "/api/liabilities",
    "/api/targets",
    "/api/rebalance",
    "/api/classifications",
    "/api/classifications/taxonomy",
    "/api/classifications/suggest",
    "/api/classifications/{ticker}",
    "/api/export",
    "/api/reset",
    "/api/extract",
    "/api/extract/pdf",
])
def test_openapi_contains_expected_paths(client: TestClient, path: str) -> None:
    r = client.get("/api/openapi.json")
    data = r.json()
    paths = data.get("paths", {})
    assert path in paths, f"path {path!r} missing from OpenAPI spec"
