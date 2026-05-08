"""LLM extraction request/response shapes."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ExtractedPosition(BaseModel):
    ticker: str
    shares: float
    cost_basis: float | None = None
    market_value: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_span: str
    validation_errors: list[str] = Field(default_factory=list)


class ExtractionResult(BaseModel):
    positions: list[ExtractedPosition]
    model: str
    extracted_at: datetime
    statement_account_name: str | None = None
    statement_account_name_confidence: float | None = None
    matched_account_id: int | None = None
    matched_account_confidence: float | None = None
    extraction_warnings: list[str] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    text: str
