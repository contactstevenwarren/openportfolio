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


# ----- position read / patch ----------------------------------------------


class PositionRead(BaseModel):
    id: int
    account_id: int
    ticker: str
    shares: float
    cost_basis: float | None
    market_value: float | None
    as_of: datetime
    source: str

    model_config = ConfigDict(from_attributes=True)


class PositionPatch(BaseModel):
    """User override for a committed position (M3).

    All fields optional; only the ones present in the body are applied.
    The HSA cash/invested split is the motivating case -- user edits
    ``market_value`` or splits one row into two via delete + manual add.
    """

    ticker: str | None = None
    shares: float | None = None
    cost_basis: float | None = None
    market_value: float | None = None


# ----- export (M5) --------------------------------------------------------


class ProvenanceRead(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    field: str
    source: str
    confidence: float | None
    llm_span: str | None
    captured_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SnapshotRead(BaseModel):
    id: int
    taken_at: datetime
    net_worth_usd: float
    payload_json: str

    model_config = ConfigDict(from_attributes=True)


class ExportResult(BaseModel):
    """Full JSON dump of user-owned state (roadmap §8 "privacy posture").

    Excludes fund_holdings (derived cache) and the YAML classifications
    (source-controlled, not user data). Covers the manual-backup case
    for v0.1 until automated Tigris push lands in v1.0.
    """

    exported_at: datetime
    app_version: str = "0.1"
    accounts: list[AccountRead]
    positions: list["PositionRead"]
    provenance: list[ProvenanceRead]
    snapshots: list[SnapshotRead]


# ----- allocation ---------------------------------------------------------


class AllocationSlice(BaseModel):
    """One wedge in the 3-ring sunburst.

    ``children`` lets the same schema carry asset_class → region →
    sub_class nesting. Leaves have ``children=[]`` and contribute their
    value directly; inner nodes' ``value`` equals the sum of their
    children.
    """

    name: str
    value: float
    pct: float
    tickers: list[str] = []
    children: list["AllocationSlice"] = []


class FiveNumberSummary(BaseModel):
    """Hero-strip numbers mandated by roadmap §4 v0.1 acceptance.

    Percentages are of net worth. ``alts`` = real estate + commodity +
    crypto + private (roadmap §4).
    """

    net_worth: float
    cash_pct: float
    us_equity_pct: float
    intl_equity_pct: float
    alts_pct: float


class AllocationResult(BaseModel):
    total: float
    by_asset_class: list[AllocationSlice]
    # Tickers held but not present in data/classifications.yaml. UI flags
    # them so the user knows they're missing from the view.
    unclassified_tickers: list[str]
    # M4 adds the 5-number summary strip. Optional for back-compat with
    # M2 clients that pre-date it.
    summary: FiveNumberSummary | None = None
