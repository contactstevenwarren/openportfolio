"""Allocation aggregate result, drift bands, drill-down responses."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

DriftBand = Literal["ok", "watch", "act", "urgent"]


class AllocationSlice(BaseModel):
    name: str
    value: float
    pct: float
    tickers: list[str] = []
    children: list["AllocationSlice"] = []
    sector_breakdown: list["AllocationSlice"] = []
    target_pct: float | None = None
    drift_pct: float | None = None
    drift_band: DriftBand | None = None


class DriftThresholds(BaseModel):
    tolerance_pct: int
    act_pct: int
    urgent_pct: int


class AllocationResult(BaseModel):
    total: float
    assets_total: float = 0.0
    liabilities_total: float = 0.0
    net_worth: float = 0.0
    by_asset_class: list[AllocationSlice]
    unclassified_tickers: list[str]
    classification_sources: dict[str, str] = Field(default_factory=dict)
    max_drift: float | None = None
    max_drift_band: DriftBand | None = None
    drift_thresholds: DriftThresholds | None = None


class PositionContribution(BaseModel):
    ticker: str
    account_id: int
    account_name: str
    contributing_value: float
    share_of_slice: float
    share_of_portfolio: float
    is_partial: bool
    classification_source: str


class PositionContributionsResponse(BaseModel):
    asset_class: str
    l2: str | None
    total: float
    positions: list[PositionContribution]
    source_counts: dict[str, int]
    unclassified_count: int


AllocationSlice.model_rebuild()
