"""ORM models matching docs/architecture.md data model.

Schema is locked for v0.1; later phases extend (not redesign) these tables.
Every user-visible field must have a corresponding Provenance row so hover
tooltips can show source + confidence (roadmap Principles).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Institution(Base):
    """Financial institution (Fidelity, Vanguard, etc.). Name is unique case-insensitively."""

    __tablename__ = "institutions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ux_institutions_name_lower", func.lower(name), unique=True),
    )


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(100))
    # type = "brokerage" | "real_estate" | "crypto" | "private" | "bank" | ...
    # Note: "hsa" type migrated to type="brokerage" + tax_treatment="hsa" on startup.
    type: Mapped[str] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    institution_id: Mapped[int | None] = mapped_column(
        ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # tax_treatment = "taxable" | "tax_deferred" | "tax_free" | "hsa"
    # tax_deferred / tax_free / hsa only valid when type="brokerage"
    tax_treatment: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'taxable'"), default="taxable"
    )
    # User-configurable staleness threshold (days). Defaults to the type-default
    # on create; can be overridden by the user via the Edit sheet.
    staleness_threshold_days: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("30"), default=30
    )
    # Archived accounts are hidden from the active list by default.
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), default=False
    )
    # When False, all positions in this account are excluded from the
    # Investment Portfolio total (allocation %, drift, rebalance) but
    # still contribute to Net Worth. Use for primary home, cars, etc.
    is_investable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("1"), default=True
    )

    positions: Mapped[list["Position"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    # Synthetic tickers allowed for non-brokerage assets (e.g. "REALESTATE:123Main").
    ticker: Mapped[str] = mapped_column(String(64), index=True)
    shares: Mapped[float] = mapped_column(Float)
    cost_basis: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Paste-time market value in USD. M4 layers live yfinance pricing on
    # top; this column remains as the fallback when yfinance is down
    # (architecture risk #4). Data model schema is "locked
    # in v0.1, extended in later phases" -- this nullable column is an
    # extension, not a redesign.
    market_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    as_of: Mapped[datetime] = mapped_column(DateTime)
    # source = "paste" | "manual" | "override"
    source: Mapped[str] = mapped_column(String(50))
    # User-managed flag: included in Investment Portfolio totals when True;
    # excluded (but still in true Net worth) when False. Defaults to True
    # for every existing and new row -- user opts out via /positions.
    investable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("1"), default=True
    )

    account: Mapped["Account"] = relationship(back_populates="positions")


class Classification(Base):
    __tablename__ = "classifications"

    ticker: Mapped[str] = mapped_column(String(64), primary_key=True)
    asset_class: Mapped[str] = mapped_column(String(50))
    sub_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(50), nullable=True)
    region: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # source = "yaml" | "yfinance" | "user"
    source: Mapped[str] = mapped_column(String(50))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    taken_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    net_worth_usd: Mapped[float] = mapped_column(Float)
    payload_json: Mapped[str] = mapped_column(Text)


class Provenance(Base):
    __tablename__ = "provenance"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    # Numeric-PK entities (Position, Account) populate entity_id.
    # String-PK entities (Classification, keyed by ticker) populate
    # entity_key. Exactly one is non-null per row. entity_id stays
    # non-nullable with a sentinel 0 for string-PK rows so existing
    # SQLite databases don't need a backfill migration -- readers
    # should branch on entity_type.
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    entity_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    field: Mapped[str] = mapped_column(String(50))
    # source = "paste:fidelity-2026-04-18" | "manual" | "yfinance:2026-04-18" | "yaml:v0.1" | ...
    source: Mapped[str] = mapped_column(String(200))
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Source span from the LLM extraction (character range or quoted excerpt).
    llm_span: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class FundHolding(Base):
    """Cached fund composition (M4 look-through).

    One row per (fund_ticker, dimension, bucket) triple, where dimension
    is one of {"asset_class", "sub_class", "sector", "region"} and bucket
    is the value within that dimension (e.g. "us_large_cap", "technology").
    weight is 0..1. fetched_at drives the 24h cache; rows older than that
    are refetched before use. Architecture data-model rule: "locked in
    v0.1, extended in later phases" -- this is a pure extension.
    """

    __tablename__ = "fund_holdings"

    id: Mapped[int] = mapped_column(primary_key=True)
    fund_ticker: Mapped[str] = mapped_column(String(64), index=True)
    dimension: Mapped[str] = mapped_column(String(20))
    bucket: Mapped[str] = mapped_column(String(50))
    weight: Mapped[float] = mapped_column(Float)
    # "yaml" | "yfinance"
    source: Mapped[str] = mapped_column(String(50))
    fetched_at: Mapped[datetime] = mapped_column(DateTime)


class Target(Base):
    """User-defined allocation targets (v0.2).

    ``path`` is the stable key: top-level asset class for ring-1
    (``equity``) or a dotted drill path (``equity.US``,
    ``fixed_income.us_aggregate``). Root targets are % of portfolio;
    group targets (``<ac>.<leaf>``) are % of parent asset class.
    Percentages are integers 0..100 validated on write.
    """

    __tablename__ = "targets"

    path: Mapped[str] = mapped_column(String(128), primary_key=True)
    pct: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
