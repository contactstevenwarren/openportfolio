"""Position commit, read, and patch DTOs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.schemas.classifications import ClassificationBucketPayload


class InlineClassification(BaseModel):
    asset_class: str
    sub_class: str | None = None
    auto_suffix: bool = True
    suggestion_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    suggestion_reasoning: str | None = None
    buckets: list[ClassificationBucketPayload] | None = None

    @model_validator(mode="after")
    def bucket_weights_sum(self) -> InlineClassification:
        if not self.buckets:
            return self
        s = sum(b.weight for b in self.buckets)
        if abs(s - 1.0) > 0.02:
            raise ValueError("bucket weights must sum to 1.0 (+/- 0.02)")
        return self


class CommitPosition(BaseModel):
    ticker: str
    shares: float
    cost_basis: float | None = None
    market_value: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_span: str
    classification: InlineClassification | None = None


class PositionCommit(BaseModel):
    account_id: int | None = None
    replace_account: bool = False
    source: str = "paste"
    positions: list[CommitPosition]


class CommitResult(BaseModel):
    account_id: int
    position_ids: list[int]
    tickers: list[str]


class PositionRead(BaseModel):
    id: int
    account_id: int
    ticker: str
    shares: float
    cost_basis: float | None
    market_value: float | None
    as_of: datetime
    source: str
    investable: bool

    model_config = ConfigDict(from_attributes=True)


class PositionPatch(BaseModel):
    ticker: str | None = None
    shares: float | None = None
    cost_basis: float | None = None
    market_value: float | None = None
    as_of: datetime | None = None
    investable: bool | None = None
