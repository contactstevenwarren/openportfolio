"""ORM models matching roadmap section 6 data model.

Schema is locked for v0.1; later phases extend (not redesign) these tables.
Every user-visible field must have a corresponding Provenance row so hover
tooltips can show source + confidence (roadmap section 3 principle).
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(100))
    # type = "brokerage" | "hsa" | "real_estate" | "crypto" | "private" | ...
    type: Mapped[str] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

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
    as_of: Mapped[datetime] = mapped_column(DateTime)
    # source = "paste" | "manual" | "override"
    source: Mapped[str] = mapped_column(String(50))

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
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    field: Mapped[str] = mapped_column(String(50))
    # source = "paste:fidelity-2026-04-18" | "manual" | "yfinance:2026-04-18" | "yaml:v0.1" | ...
    source: Mapped[str] = mapped_column(String(200))
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Source span from the LLM extraction (character range or quoted excerpt).
    llm_span: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
