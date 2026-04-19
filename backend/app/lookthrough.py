"""Fund look-through for the M4 allocation engine.

A fund position (e.g. VTI) doesn't live on one point on the 3-ring sunburst;
it fans out across asset classes, sub classes, sectors, and regions. This
module returns those weight breakdowns for a ticker.

Resolution order (roadmap §6 "classification & look-through"):
    1. 24h SQLite cache in the ``fund_holdings`` table.
    2. yfinance live fetch -- primary data source when reachable.
    3. YAML fallback in ``data/lookthrough.yaml`` -- covers the maintainer's
       core holdings, used when yfinance is down or the ticker isn't in
       Yahoo's dataset (roadmap risk #4 + #10).

Direct holdings (individual stocks, crypto coins) aren't funds -- ``breakdown``
returns ``None`` for those, and the allocation engine falls back to the
ticker's own classification entry as a 100% attribution.

yfinance hits real network at runtime; tests mock ``_fetch_from_yfinance``.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import yaml
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .classifications import REPO_ROOT
from .config import settings
from .models import FundHolding

DEFAULT_YAML_PATH = REPO_ROOT / "data" / "lookthrough.yaml"
CACHE_TTL = timedelta(hours=24)
DIMENSIONS = ("asset_class", "sub_class", "sector", "region")


@dataclass(frozen=True)
class Breakdown:
    """Composition of a fund across the four allocation dimensions.

    Each dict maps bucket -> weight in 0..1. Missing dimensions (e.g. a
    bond fund's sector dict) are allowed -- the allocation engine then
    attributes that dimension as "other" for the fund's dollars.
    source marks where the data came from so provenance tooltips can
    show "yfinance 2026-04-18" vs "yaml:v0.1".
    """

    ticker: str
    asset_class: dict[str, float]
    sub_class: dict[str, float]
    sector: dict[str, float]
    region: dict[str, float]
    source: str


# ---------------------------------------------------------------------------
# YAML fallback
# ---------------------------------------------------------------------------


def _load_yaml(path: Path = DEFAULT_YAML_PATH) -> dict[str, Breakdown]:
    if not path.exists():
        return {}
    with path.open() as f:
        raw = yaml.safe_load(f) or {}
    out: dict[str, Breakdown] = {}
    for ticker, dims in raw.items():
        if not isinstance(dims, dict):
            continue
        out[ticker] = Breakdown(
            ticker=ticker,
            asset_class=dict(dims.get("asset_class") or {}),
            sub_class=dict(dims.get("sub_class") or {}),
            sector=dict(dims.get("sector") or {}),
            region=dict(dims.get("region") or {}),
            source="yaml",
        )
    return out


_yaml_cache: dict[str, Breakdown] | None = None


def _yaml() -> dict[str, Breakdown]:
    global _yaml_cache
    if _yaml_cache is None:
        _yaml_cache = _load_yaml()
    return _yaml_cache


def reload_yaml() -> None:
    """Force a reload of the lookthrough YAML (primarily for tests)."""
    global _yaml_cache
    _yaml_cache = None


# ---------------------------------------------------------------------------
# yfinance adapter (runtime only; tests mock this)
# ---------------------------------------------------------------------------


def _fetch_from_yfinance(ticker: str) -> Breakdown | None:  # pragma: no cover
    """Best-effort pull of fund composition from yfinance.

    Yahoo's HTML scraper breaks 2-4x a year (roadmap risk #10) so any
    exception is swallowed and treated as "not available" -- the caller
    then falls back to the YAML. Return None if the ticker has no
    ``funds_data`` (i.e. it's an individual stock, not a fund).
    """
    try:
        import yfinance as yf  # type: ignore
    except ImportError:
        return None
    try:
        t = yf.Ticker(ticker)
        fd = getattr(t, "funds_data", None)
        if fd is None:
            return None
        asset_class = dict(getattr(fd, "asset_classes", {}) or {})
        sector = dict(getattr(fd, "sector_weightings", {}) or {})
        if not asset_class and not sector:
            return None
        return Breakdown(
            ticker=ticker,
            asset_class=asset_class,
            sub_class={},
            sector=sector,
            region={},
            source="yfinance",
        )
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 24h SQLite cache
# ---------------------------------------------------------------------------


def _naive_utc(dt: datetime) -> datetime:
    """SQLite DateTime columns strip tzinfo; compare with naive UTC."""
    return dt.astimezone(UTC).replace(tzinfo=None) if dt.tzinfo else dt


def _read_cache(db: Session, ticker: str, now: datetime) -> Breakdown | None:
    rows: list[FundHolding] = (
        db.query(FundHolding).filter(FundHolding.fund_ticker == ticker).all()
    )
    if not rows:
        return None
    fresh_cutoff = _naive_utc(now - CACHE_TTL)
    if any(_naive_utc(r.fetched_at) < fresh_cutoff for r in rows):
        return None
    dims: dict[str, dict[str, float]] = {d: {} for d in DIMENSIONS}
    source = rows[0].source
    for r in rows:
        if r.dimension in dims:
            dims[r.dimension][r.bucket] = r.weight
    return Breakdown(
        ticker=ticker,
        asset_class=dims["asset_class"],
        sub_class=dims["sub_class"],
        sector=dims["sector"],
        region=dims["region"],
        source=source,
    )


def _write_cache(db: Session, br: Breakdown, now: datetime) -> None:
    db.execute(delete(FundHolding).where(FundHolding.fund_ticker == br.ticker))
    fetched_at = _naive_utc(now)
    rows: list[FundHolding] = []
    for dim in DIMENSIONS:
        for bucket, weight in getattr(br, dim).items():
            rows.append(
                FundHolding(
                    fund_ticker=br.ticker,
                    dimension=dim,
                    bucket=bucket,
                    weight=weight,
                    source=br.source,
                    fetched_at=fetched_at,
                )
            )
    db.add_all(rows)
    db.commit()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_breakdown(
    ticker: str,
    db: Session | None = None,
    now: datetime | None = None,
) -> Breakdown | None:
    """Return composition for ``ticker`` or None if it's not a fund we know.

    Pure function when ``db`` is None -- skips the SQLite cache and goes
    yfinance → YAML. Tests pass ``db=None`` to avoid a session fixture
    when they only care about the YAML fallback.
    """
    now = now or datetime.now(UTC)

    if db is not None:
        cached = _read_cache(db, ticker, now)
        if cached is not None:
            return cached

    fresh = _fetch_from_yfinance(ticker) if settings.lookthrough_yfinance_enabled else None
    if fresh is not None:
        if db is not None:
            _write_cache(db, fresh, now)
        return fresh

    fallback = _yaml().get(ticker)
    if fallback is not None and db is not None:
        _write_cache(db, fallback, now)
    return fallback


def get_breakdowns(
    tickers: Iterable[str],
    db: Session | None = None,
    now: datetime | None = None,
) -> dict[str, Breakdown]:
    """Batch variant returning only tickers with a known breakdown."""
    out: dict[str, Breakdown] = {}
    for t in tickers:
        br = get_breakdown(t, db=db, now=now)
        if br is not None:
            out[t] = br
    return out
