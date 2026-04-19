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

from pydantic import BaseModel, Field


class ExtractedPosition(BaseModel):
    ticker: str
    shares: float
    cost_basis: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_span: str
    validation_errors: list[str] = Field(default_factory=list)


class ExtractionResult(BaseModel):
    positions: list[ExtractedPosition]
    # LiteLLM-style model string, e.g. "azure/<deployment_name>". Stored so
    # the review UI can show which provider produced the extraction.
    model: str
    extracted_at: datetime
