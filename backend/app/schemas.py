"""Pydantic schemas for LLM extraction output.

Shape mirrors docs/architecture.md extraction pipeline requirements: every
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


class AccountPatch(BaseModel):
    """Edit label and/or type on an existing account. Both optional."""

    label: str | None = None
    type: str | None = None


class AccountRead(BaseModel):
    id: int
    label: str
    type: str
    currency: str

    model_config = ConfigDict(from_attributes=True)


# ----- position commit ----------------------------------------------------


class InlineClassification(BaseModel):
    """Classification fields submitted alongside a manual-entry position.

    Set by /manual so the user's choice of asset_class / sub_class /
    sector / region lands in the Classification table in the same
    transaction as the Position. /paste leaves it None -- pasted tickers
    look up classification from YAML or user DB rows.
    """

    asset_class: str
    sub_class: str | None = None
    sector: str | None = None
    region: str | None = None


class CommitPosition(BaseModel):
    """A single row the user reviewed and approved for commit.

    Mirrors ExtractedPosition minus validation_errors (the review UI has
    already resolved them). confidence + source_span travel with the row
    so the commit endpoint can persist them in the provenance table.

    ``classification`` is set by /manual entries and triggers a
    Classification upsert + auto-suffix for ticker collisions. /paste
    leaves it None.
    """

    ticker: str
    shares: float
    cost_basis: float | None = None
    market_value: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_span: str
    classification: InlineClassification | None = None


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
    # Final tickers for each position (same index as position_ids).
    # Differs from the proposed ticker only when ``classification`` was
    # set and the slug collided with an existing Classification row --
    # the server auto-suffixes ("gold-bar" -> "gold-bar-2") and the UI
    # surfaces the final value.
    tickers: list[str]


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
    # Non-null for string-PK entities (Classification, keyed by ticker).
    # Null for numeric-PK entities (Position, Account) -- use entity_id.
    entity_key: str | None = None
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
    """Full JSON dump of user-owned state (architecture Privacy).

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
    """Hero-strip numbers mandated by v0.1 Foundation acceptance (roadmap phase 0.1).

    Percentages are of net worth. ``alts`` = real estate + commodity +
    crypto + private (v0.1 scope).
    """

    net_worth: float
    cash_pct: float
    us_equity_pct: float
    intl_equity_pct: float
    alts_pct: float


# ----- classifications (v0.1.5 M3) ----------------------------------------


class BreakdownBucket(BaseModel):
    """One weighted bucket in a fund's look-through dimension."""

    bucket: str
    weight: float


class FundBreakdown(BaseModel):
    """Full look-through composition for a fund (from data/lookthrough.yaml).

    Each dimension is a list of ``BreakdownBucket`` sorted by weight
    descending so the UI can render the tooltip in a stable order
    without re-sorting. Dimensions with no data are empty lists (bond
    funds omit sector, gold funds omit region, etc.).
    """

    region: list[BreakdownBucket] = []
    sub_class: list[BreakdownBucket] = []
    sector: list[BreakdownBucket] = []


class ClassificationRow(BaseModel):
    """One row on the /classifications page.

    Merged view over the YAML baseline and the DB user rows. ``source``
    reflects where the active row came from; ``overrides_yaml`` is True
    when a user row is replacing a YAML value (UI surfaces a badge).

    ``has_breakdown`` flags funds that the allocation engine decomposes
    via look-through (VT, VTI, VXUS, ...). The UI uses it to swap the
    single-bucket sub_class/sector/region cells for an "Auto-split"
    summary and to warn before an edit disables the decomposition.
    ``breakdown`` carries the full look-through (all dimensions) so the
    hover tooltip can show the same data the allocation engine uses,
    matching the roadmap's "radical transparency" principle.
    """

    ticker: str
    asset_class: str
    sub_class: str | None = None
    sector: str | None = None
    region: str | None = None
    source: str  # "yaml" | "user"
    overrides_yaml: bool = False
    has_breakdown: bool = False
    breakdown: FundBreakdown | None = None


class ClassificationPatch(BaseModel):
    """Upsert payload for PATCH /api/classifications/{ticker}.

    Every field is required -- a user-owned classification must be
    complete. ``asset_class`` must be in the taxonomy enum; the endpoint
    enforces it so bad values can't sneak past Pydantic.
    """

    asset_class: str
    sub_class: str | None = None
    sector: str | None = None
    region: str | None = None


class TaxonomyOption(BaseModel):
    """One choice for the asset_class dropdown."""

    value: str   # canonical snake_case stored in DB
    label: str   # friendly label shown in UI ("Fixed Income")


class Taxonomy(BaseModel):
    asset_classes: list[TaxonomyOption]


# Single source of truth for the allocation taxonomy. Canonical values
# are snake_case to match DB storage; labels are human-friendly for the
# UI. Adding a new asset class = one line here. Displayed by /manual
# and /classifications forms.
ASSET_CLASS_OPTIONS: list[TaxonomyOption] = [
    TaxonomyOption(value="equity", label="Equity"),
    TaxonomyOption(value="fixed_income", label="Fixed Income"),
    TaxonomyOption(value="real_estate", label="Real Estate"),
    TaxonomyOption(value="commodity", label="Commodity"),
    TaxonomyOption(value="crypto", label="Crypto"),
    TaxonomyOption(value="cash", label="Cash"),
    TaxonomyOption(value="private", label="Private"),
]


class AllocationResult(BaseModel):
    total: float
    by_asset_class: list[AllocationSlice]
    # Tickers held but not present in data/classifications.yaml. UI flags
    # them so the user knows they're missing from the view.
    unclassified_tickers: list[str]
    # M4 adds the 5-number summary strip. Optional for back-compat with
    # M2 clients that pre-date it.
    summary: FiveNumberSummary | None = None
    # Per-ticker source of the classification used to place it in the
    # tree. Values: "yaml" (bundled baseline), "user" (DB override),
    # "prefix" (synthetic fallback, pre-v0.1.5-M4). Drives the sunburst
    # hover provenance -- e.g. "classified as: us_tips (your override)"
    # when the user overrode a YAML ticker.
    classification_sources: dict[str, str] = Field(default_factory=dict)
