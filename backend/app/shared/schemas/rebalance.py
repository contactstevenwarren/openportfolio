"""Rebalance suggestion API shapes."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

RebalanceDirection = Literal["buy", "sell", "hold"]
RebalanceMode = Literal["full", "new_money"]


class RebalanceMove(BaseModel):
    path: str
    direction: RebalanceDirection
    delta_usd: float
    target_pct: float
    actual_pct: float
    parent_total_usd: float
    children: list["RebalanceMove"] = []


class RebalanceResult(BaseModel):
    mode: RebalanceMode
    total: float
    contribution_usd: float | None = None
    moves: list[RebalanceMove] = []


RebalanceMove.model_rebuild()
