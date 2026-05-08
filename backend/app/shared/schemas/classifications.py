"""Classification bucket and taxonomy API types."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.taxonomy import TAXONOMY_L1_ORDER


class ClassificationBucketPayload(BaseModel):
    asset_class: str
    sub_class: str | None = None
    weight: float = Field(gt=0.0, le=1.0)


class ClassificationRow(BaseModel):
    ticker: str
    buckets: list[ClassificationBucketPayload]
    source: str
    overrides_yaml: bool = False
    has_breakdown: bool = False


class ClassificationPatch(BaseModel):
    buckets: list[ClassificationBucketPayload] = Field(min_length=1)

    @model_validator(mode="after")
    def weights_sum_to_one(self) -> ClassificationPatch:
        s = sum(b.weight for b in self.buckets)
        if abs(s - 1.0) > 0.02:
            raise ValueError("bucket weights must sum to 1.0 (+/- 0.02)")
        return self


class ClassificationSuggestRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=64)


class ClassificationSuggestItem(BaseModel):
    ticker: str
    source: Literal["existing", "llm", "none"]
    asset_class: str | None = None
    sub_class: str | None = None
    confidence: float | None = None
    reasoning: str | None = None


class TaxonomyOption(BaseModel):
    value: str
    label: str


class Taxonomy(BaseModel):
    asset_classes: list[TaxonomyOption]
    sub_classes_by_class: dict[str, list[TaxonomyOption]] = Field(default_factory=dict)


ASSET_CLASS_OPTIONS: list[TaxonomyOption] = [
    TaxonomyOption(value=k, label=k) for k in TAXONOMY_L1_ORDER
]
