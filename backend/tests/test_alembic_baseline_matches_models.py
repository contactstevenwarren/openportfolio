"""Guardrail: Alembic baseline revision matches ORM ``Base.metadata`` DDL."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app import models  # noqa: F401 -- register metadata
from app.config import settings
from app.db import Base


def _app_table_columns(engine_url: str) -> dict[str, list[str]]:
    eng = create_engine(engine_url, connect_args={"check_same_thread": False})
    try:
        insp = inspect(eng)
        out: dict[str, list[str]] = {}
        for t in insp.get_table_names():
            if t == "alembic_version":
                continue
            out[t] = sorted(c["name"] for c in insp.get_columns(t))
        return dict(sorted(out.items()))
    finally:
        eng.dispose()


def test_alembic_upgrade_matches_create_all(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Fresh DB: ``alembic upgrade head`` yields the same columns as ``create_all``."""
    url_alembic = f"sqlite:///{tmp_path}/from_alembic.db"
    monkeypatch.setattr(settings, "database_url", url_alembic)
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")
    cols_migrate = _app_table_columns(url_alembic)

    url_co = f"sqlite:///{tmp_path}/from_create_all.db"
    eng = create_engine(url_co, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    eng.dispose()
    cols_create = _app_table_columns(url_co)

    assert cols_migrate == cols_create
