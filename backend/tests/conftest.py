"""Shared pytest fixtures.

The `client` fixture provides a FastAPI TestClient backed by a fresh
SQLite database per test (tmp_path), with admin-token auth pre-seeded
and get_db overridden to the test engine. Tests that only exercise
pure functions (e.g. test_validation, test_classifications) don't need
this -- they import directly.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import db as db_module
from app.config import settings
from app.db import Base, get_db
from app.main import app

ADMIN_TOKEN = "test-admin-token"


@pytest.fixture
def test_db(tmp_path) -> Iterator[Session]:  # type: ignore[no-untyped-def]
    url = f"sqlite:///{tmp_path}/test.db"
    engine = create_engine(url, connect_args={"check_same_thread": False}, future=True)
    TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(engine)

    def _get_db() -> Iterator[Session]:
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _get_db
    settings.admin_token = ADMIN_TOKEN

    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


@pytest.fixture
def client(test_db: Session) -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-Admin-Token": ADMIN_TOKEN}
