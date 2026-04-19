"""Pydantic schemas for LLM extraction output.

Shape mirrors roadmap section 6 "extraction pipeline" requirements: every
extracted row carries confidence and a source span, and deterministic
validation errors ride alongside the row so the review UI can surface
them (v0.1 review-and-confirm is mandatory regardless of confidence).

Pydantic Field constraints stay minimal on purpose: only impossible
shapes (e.g. confidence outside 0..1) hard-fail at parse time. Domain
issues like bad tickers, zero shares, or PII in the source span are
flagged as validation_errors by the validation layer so the user can
review and fix them in the UI, not rejected silently.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExtractedPosition(BaseModel):
    ticker: str
    shares: float
    cost_basis: float | None = None
    # Paste-time market value in USD. Extracted verbatim from the paste when
    # shown (brokerage statements usually include it). Used by the M2
    # allocation stub to weight slices; M4 swaps in live yfinance prices
    # and keeps market_value as the disaster fallback if yfinance is down.
    market_value: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_span: str
    validation_errors: list[str] = Field(default_factory=list)


class ExtractionResult(BaseModel):
    positions: list[ExtractedPosition]
    # LiteLLM-style model string, e.g. "azure/<deployment_name>". Stored so
    # the review UI can show which provider produced the extraction.
    model: str
    extracted_at: datetime


class ExtractRequest(BaseModel):
    text: str


# ----- accounts ------------------------------------------------------------


class AccountCreate(BaseModel):
    label: str
    type: str = "brokerage"


class AccountRead(BaseModel):
    id: int
    label: str
    type: str
    currency: str

    model_config = ConfigDict(from_attributes=True)


# ----- position commit ----------------------------------------------------


class CommitPosition(BaseModel):
    """A single row the user reviewed and approved for commit.

    Mirrors ExtractedPosition minus validation_errors (the review UI has
    already resolved them). confidence + source_span travel with the row
    so the commit endpoint can persist them in the provenance table.
    """

    ticker: str
    shares: float
    cost_basis: float | None = None
    market_value: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_span: str


class PositionCommit(BaseModel):
    # account_id is optional: when absent, the server uses the first
    # account or auto-seeds a "Default" brokerage one (Decision 1a).
    account_id: int | None = None
    # Free-form identifier stored on each provenance row, e.g.
    # "paste:fidelity-2026-04-19" or "manual". Defaults broadly.
    source: str = "paste"
    positions: list[CommitPosition]


class CommitResult(BaseModel):
    account_id: int
    position_ids: list[int]


# ----- allocation ---------------------------------------------------------


class AllocationSlice(BaseModel):
    # asset_class name (e.g. "equity"). Sub-class / sector / region arrive
    # in M4 as additional rings.
    name: str
    value: float
    pct: float
    tickers: list[str]


class AllocationResult(BaseModel):
    total: float
    by_asset_class: list[AllocationSlice]
    # Tickers held but not present in data/classifications.yaml. UI flags
    # them so the user knows they're missing from the view.
    unclassified_tickers: list[str]
