from fastapi import FastAPI

from . import models  # noqa: F401  -- register models with Base.metadata
from .bootstrap import lifespan
from .config import settings
from .features.accounts.router import router as accounts_router
from .features.admin.router import admin_router, export_router
from .features.allocation.router import router as allocation_router
from .features.classifications.router import router as classifications_router
from .features.extract.router import router as extract_router
from .features.health.router import router as health_router
from .features.institutions.router import router as institutions_router
from .features.liabilities.router import router as liabilities_router
from .features.positions.router import router as positions_router
from .features.rebalance.router import router as rebalance_router
from .features.snapshots.router import router as snapshots_router
from .features.targets.router import router as targets_router

_OPENAPI_TAGS = [
    {"name": "health", "description": "Liveness probe."},
    {"name": "extract", "description": "LLM-powered position extraction from pasted text or PDF."},
    {"name": "accounts", "description": "Investment and manual accounts (brokerage, real-estate, private, …)."},
    {"name": "institutions", "description": "Financial institutions referenced by accounts and liabilities."},
    {"name": "positions", "description": "Individual holdings inside an account."},
    {"name": "allocation", "description": "Portfolio-wide asset allocation, drift, and per-class breakdowns."},
    {"name": "snapshots", "description": "Historical net-worth snapshots written automatically on mutations."},
    {"name": "liabilities", "description": "Debts subtracted from assets to produce net worth."},
    {"name": "targets", "description": "Target allocation percentages used for drift and rebalance calculations."},
    {"name": "rebalance", "description": "Trade suggestions to bring the portfolio back to target weights."},
    {"name": "classifications", "description": "Ticker → asset-class/sub-class mappings (YAML seed + user overrides)."},
    {"name": "export", "description": "Full JSON dump of all user-owned state for backup or migration."},
    {"name": "admin", "description": "Destructive admin operations (reset)."},
]

app = FastAPI(
    lifespan=lifespan,
    title="OpenPortfolio API",
    version="0.1",
    description=(
        "Personal portfolio tracker backend.\n\n"
        "## Authentication\n\n"
        "Every endpoint except `GET /health` requires the `X-Admin-Token` header "
        "whose value must match the `ADMIN_TOKEN` environment variable set on the server. "
        "Use the **Authorize** button above to enter your token once for the session."
    ),
    openapi_url="/api/openapi.json" if settings.docs_enabled else None,
    docs_url="/api/docs" if settings.docs_enabled else None,
    redoc_url="/api/redoc" if settings.docs_enabled else None,
    openapi_tags=_OPENAPI_TAGS,
)

app.include_router(health_router)
app.include_router(extract_router)
app.include_router(accounts_router)
app.include_router(institutions_router)
app.include_router(positions_router)
app.include_router(allocation_router)
app.include_router(snapshots_router)
app.include_router(liabilities_router)
app.include_router(targets_router)
app.include_router(rebalance_router)
app.include_router(classifications_router)
app.include_router(export_router)
app.include_router(admin_router)
