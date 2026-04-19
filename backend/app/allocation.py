"""Allocation engine v0.1 stub (roadmap section 6 "effective allocation").

v0.1 sums by asset_class only -- no sub-class / sector / region rings,
no fund look-through. M4 adds yfinance look-through and the remaining
dimensions; this module is a thin aggregator that M4 replaces in place,
not redesigns.

Dollar value per position is resolved in this order:
    market_value  ->  cost_basis  ->  0.0

market_value is the paste-time figure (stored at commit). M4 will layer
live yfinance prices on top -- when pricing is fresh it takes
precedence over market_value; when yfinance is down (risk #4) we fall
back to stored market_value, then cost_basis.
"""

from collections import defaultdict

from .classifications import ClassificationEntry
from .models import Position
from .schemas import AllocationResult, AllocationSlice


def position_value(position: Position) -> float:
    if position.market_value is not None:
        return position.market_value
    if position.cost_basis is not None:
        return position.cost_basis
    return 0.0


def aggregate(
    positions: list[Position],
    classifications: dict[str, ClassificationEntry],
) -> AllocationResult:
    grouped: dict[str, list[Position]] = defaultdict(list)
    unclassified: list[str] = []
    for p in positions:
        entry = classifications.get(p.ticker)
        if entry is None:
            unclassified.append(p.ticker)
            continue
        grouped[entry.asset_class].append(p)

    slices: list[AllocationSlice] = []
    total = 0.0
    for asset_class, plist in grouped.items():
        value = sum(position_value(p) for p in plist)
        slices.append(
            AllocationSlice(
                name=asset_class,
                value=value,
                pct=0.0,
                tickers=[p.ticker for p in plist],
            )
        )
        total += value

    if total > 0:
        for s in slices:
            s.pct = 100 * s.value / total

    slices.sort(key=lambda s: s.value, reverse=True)

    # Stable, deduplicated unclassified list -- preserves first-seen order
    # so the UI highlights the earliest offender first.
    seen: set[str] = set()
    unique_unclassified = [t for t in unclassified if not (t in seen or seen.add(t))]

    return AllocationResult(
        total=total,
        by_asset_class=slices,
        unclassified_tickers=unique_unclassified,
    )
