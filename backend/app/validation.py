"""Deterministic validation for LLM-extracted positions (roadmap section 6).

Pure functions, no I/O. Each validator returns a list of human-readable
error strings; empty list means valid. Validators never mutate or reject
inputs -- they produce annotations that the review UI surfaces so the
user can fix rows before commit.

Rules implemented for v0.1 M2:
- ticker matches ^[A-Z][A-Z0-9.-]{0,9}$ (plan + roadmap data-model)
- shares > 0 and below an implausibility ceiling
- cost_basis, if present, >= 0 and below an implausibility ceiling
- source_span contains no run of 6+ consecutive digits (PII heuristic;
  catches account / routing numbers pasted accidentally -- roadmap §8)

Synthetic tickers introduced in M3 manual entry (e.g. "REALESTATE:123Main")
skip this module by construction: they never flow through /api/extract.
"""

import re

from .schemas import ExtractedPosition

TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
LONG_DIGIT_RUN_RE = re.compile(r"\d{6,}")

# Plausibility ceilings. Chosen wide enough that a real position never
# trips them; tight enough to catch unit confusion (e.g. LLM reports
# dollars as shares, or basis in cents).
MAX_SHARES = 1e8
MAX_COST_BASIS = 1e10


def validate_ticker(ticker: str) -> list[str]:
    if not TICKER_RE.match(ticker):
        return [f"ticker {ticker!r} does not match {TICKER_RE.pattern}"]
    return []


def validate_shares(shares: float) -> list[str]:
    errors: list[str] = []
    if shares <= 0:
        errors.append(f"shares must be > 0 (got {shares})")
    if shares > MAX_SHARES:
        errors.append(f"shares {shares} exceeds plausibility bound {MAX_SHARES:g}")
    return errors


def _validate_nonneg_dollar(value: float | None, field: str) -> list[str]:
    if value is None:
        return []
    errors: list[str] = []
    if value < 0:
        errors.append(f"{field} must be >= 0 (got {value})")
    if value > MAX_COST_BASIS:
        errors.append(
            f"{field} {value} exceeds plausibility bound {MAX_COST_BASIS:g}"
        )
    return errors


def validate_cost_basis(cost_basis: float | None) -> list[str]:
    return _validate_nonneg_dollar(cost_basis, "cost_basis")


def validate_market_value(market_value: float | None) -> list[str]:
    return _validate_nonneg_dollar(market_value, "market_value")


def validate_source_span(source_span: str) -> list[str]:
    # Heuristic only. A legitimate 1_000_000-share position would trip
    # this; that's acceptable because validation is advisory, not
    # blocking, and the review UI lets the user override.
    if LONG_DIGIT_RUN_RE.search(source_span):
        return ["source_span contains a digit run of 6+ (possible account/PII leak)"]
    return []


def validate_position(position: ExtractedPosition) -> list[str]:
    return [
        *validate_ticker(position.ticker),
        *validate_shares(position.shares),
        *validate_cost_basis(position.cost_basis),
        *validate_market_value(position.market_value),
        *validate_source_span(position.source_span),
    ]


def annotate(positions: list[ExtractedPosition]) -> list[ExtractedPosition]:
    """Return copies of `positions` with validation_errors populated.

    Inputs are not mutated; Pydantic model_copy produces new instances so
    callers holding the originals keep empty error lists.
    """
    return [
        p.model_copy(update={"validation_errors": validate_position(p)})
        for p in positions
    ]
