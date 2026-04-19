"""Unit tests for require_admin_token.

A test-local FastAPI app mounts a single protected route. This keeps the
tests independent of whatever real endpoints land in M2+ while still
exercising the dependency through FastAPI's real request path.
"""

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import require_admin_token
from app.config import settings


def _client(token: str) -> TestClient:
    # Overriding settings instead of monkeypatching os.environ because the
    # settings object is instantiated once at import time.
    settings.admin_token = token
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(require_admin_token)])
    def protected() -> dict[str, bool]:
        return {"ok": True}

    return TestClient(app)


def test_missing_header_returns_401() -> None:
    client = _client("secret")
    r = client.get("/protected")
    assert r.status_code == 401


def test_wrong_token_returns_401() -> None:
    client = _client("secret")
    r = client.get("/protected", headers={"X-Admin-Token": "nope"})
    assert r.status_code == 401


def test_correct_token_returns_200() -> None:
    client = _client("secret")
    r = client.get("/protected", headers={"X-Admin-Token": "secret"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_unconfigured_server_refuses_503() -> None:
    # Protect against the bootstrap footgun where an empty ADMIN_TOKEN in
    # env would otherwise match an empty header and let requests through.
    client = _client("")
    r = client.get("/protected", headers={"X-Admin-Token": ""})
    assert r.status_code == 503
