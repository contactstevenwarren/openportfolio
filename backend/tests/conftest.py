"""Shared pytest fixtures.

The `client` fixture provides a FastAPI TestClient backed by a fresh
SQLite database per test (tmp_path), with admin-token auth pre-seeded
and get_db overridden to the test engine. Tests that only exercise
pure functions (e.g. test_validation, test_classifications) don't need
this -- they import directly.

``db.engine`` is monkeypatched to the test engine so FastAPI lifespan
uses the same SQLite file as dependency-injected sessions. Alembic is
``stamp``ed to ``head`` after ``create_all`` so lifespan's
``alembic_version`` check passes without running the full migration graph
on every test.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import db as db_module
from app.config import settings
from app.db import Base, get_db
from app.main import app

ADMIN_TOKEN = "test-admin-token"


@pytest.fixture
def test_db(tmp_path, monkeypatch) -> Iterator[Session]:  # type: ignore[no-untyped-def]
    url = f"sqlite:///{tmp_path}/test.db"
    engine = create_engine(url, connect_args={"check_same_thread": False}, future=True)
    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(settings, "database_url", url)

    TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(engine)

    alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    cfg = Config(str(alembic_ini))
    command.stamp(cfg, "head")

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
