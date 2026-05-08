"""Application startup: Alembic guard, reference data seed."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from . import db as db_pkg

_WELL_KNOWN_INSTITUTIONS = [
    "Ally Bank",
    "Bank of America",
    "Capital One",
    "Charles Schwab",
    "Chase",
    "Coinbase",
    "E*TRADE",
    "Empower Retirement",
    "Fidelity",
    "Kraken",
    "Merrill Edge",
    "Robinhood",
    "SoFi",
    "TD Ameritrade",
    "Vanguard",
    "Wealthfront",
    "Wells Fargo",
]


def _ensure_alembic_if_nonempty_db(engine: Engine) -> None:
    """Fail fast when SQLite has application tables but no Alembic revision row."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    if not tables:
        return
    if "alembic_version" not in tables:
        logging.getLogger(__name__).error(
            "Database has tables but no alembic_version (unsupported pre-cutoff schema). "
            "Export via GET /api/export, reset the database file, run "
            "`alembic upgrade head` from /app/backend, then restore. "
            "See README.md — Database migrations."
        )
        raise RuntimeError(
            "missing alembic_version — see README Database migrations"
        )


def _seed_institutions(eng: Engine) -> None:
    """Insert well-known US institutions on first boot. Idempotent."""
    with eng.begin() as conn:
        for name in _WELL_KNOWN_INSTITUTIONS:
            conn.execute(
                text(
                    "INSERT OR IGNORE INTO institutions (name) VALUES (:name)"
                ),
                {"name": name},
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _ensure_alembic_if_nonempty_db(db_pkg.engine)
    _seed_institutions(db_pkg.engine)
    yield
