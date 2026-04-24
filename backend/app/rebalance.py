"""Rebalance math (v0.5 M1).

Pure functions over an already-built ``AllocationResult``. No I/O, no DB,
no HTTP. Two modes:

* ``full`` -- delta vs target for every L1 class (and nested L2 where
  group targets exist). Sum of L1 deltas is ~0; sum of L2 deltas inside
  a class is ~0. Sign of delta drives buy/sell; the drift band drives
  the ``hold`` label.
* ``new_money`` -- distribute a positive USD contribution by gap-fill
  first (``max(0, desired - current)``) and excess proportional to
  target percent among classes at or under target. No sells.

All math in floats; callers round for display.
"""

import math
from collections import defaultdict

from .schemas import (
    AllocationResult,
    AllocationSlice,
    RebalanceDirection,
    RebalanceMove,
    RebalanceResult,
)


def _has_root_targets(targets: dict[str, float]) -> bool:
    return any("." not in p for p in targets)


def _has_group_targets(asset_class: str, targets: dict[str, float]) -> bool:
    prefix = f"{asset_class}."
    return any(p.startswith(prefix) for p in targets)


def _l2_currents(
    ac: str, ac_slice: AllocationSlice, targets: dict[str, float]
) -> dict[str, tuple[float, float]]:
    """Return {sub_path: (current_usd, actual_pct_of_parent)} for L2 targets.

    Equity targets key by region (``equity.<region>`` -> region slice);
    non-equity targets key by sub_class name (``<ac>.<sub>`` -> sum of
    leaf values across regions with that sub_class name). Mirrors the
    scoping used by ``apply_drift``.
    """
    parent = ac_slice.value
    out: dict[str, tuple[float, float]] = {}
    prefix = f"{ac}."

    if ac == "equity":
        region_values = {c.name: c.value for c in ac_slice.children}
        for path in targets:
            if not path.startswith(prefix):
                continue
            name = path[len(prefix):]
            cur = region_values.get(name, 0.0)
            pct = (100.0 * cur / parent) if parent > 0 else 0.0
            out[path] = (cur, pct)
        return out

    sub_values: dict[str, float] = defaultdict(float)
    for reg in ac_slice.children:
        for leaf in reg.children:
            sub_values[leaf.name] += leaf.value
    for path in targets:
        if not path.startswith(prefix):
            continue
        name = path[len(prefix):]
        cur = sub_values.get(name, 0.0)
        pct = (100.0 * cur / parent) if parent > 0 else 0.0
        out[path] = (cur, pct)
    return out


def _direction_full(drift_pct: float, delta_usd: float, minor: float) -> RebalanceDirection:
    if abs(drift_pct) <= minor:
        return "hold"
    return "buy" if delta_usd > 0 else "sell"


def _direction_new_money(
    drift_pct: float, delta_usd: float, minor: float
) -> RebalanceDirection:
    # Spec: direction becomes "buy" unless the drift band is hold and
    # delta is 0, then "hold". delta_usd is always >= 0 here.
    if delta_usd == 0.0 and abs(drift_pct) <= minor:
        return "hold"
    return "buy"


def compute_rebalance(
    result: AllocationResult,
    targets: dict[str, float],
    *,
    drift_minor_pct: float,
) -> RebalanceResult:
    """Full rebalance: deltas to realign every targeted class."""
    total = result.total
    if total <= 0 or not _has_root_targets(targets):
        return RebalanceResult(mode="full", total=total, moves=[])

    moves: list[RebalanceMove] = []
    for ac_slice in result.by_asset_class:
        ac = ac_slice.name
        target = targets.get(ac)
        if target is None:
            continue
        actual_pct = ac_slice.pct
        drift_pct = target - actual_pct
        delta_usd = drift_pct / 100.0 * total

        children: list[RebalanceMove] = []
        if _has_group_targets(ac, targets):
            currents = _l2_currents(ac, ac_slice, targets)
            parent_value = ac_slice.value
            for sub_path, (cur_usd, cur_pct) in currents.items():
                t2 = targets[sub_path]
                d2 = t2 - cur_pct
                delta2 = d2 / 100.0 * parent_value
                children.append(
                    RebalanceMove(
                        path=sub_path,
                        direction=_direction_full(d2, delta2, drift_minor_pct),
                        delta_usd=delta2,
                        target_pct=t2,
                        actual_pct=cur_pct,
                        parent_total_usd=parent_value,
                        children=[],
                    )
                )

        moves.append(
            RebalanceMove(
                path=ac,
                direction=_direction_full(drift_pct, delta_usd, drift_minor_pct),
                delta_usd=delta_usd,
                target_pct=target,
                actual_pct=actual_pct,
                parent_total_usd=total,
                children=children,
            )
        )

    return RebalanceResult(mode="full", total=total, moves=moves)


def _allocate_new_money(
    items: list[tuple[str, float, float, float, float]],
    contribution: float,
    minor: float,
) -> dict[str, float]:
    """Gap-fill then proportional-to-target excess.

    ``items`` is a list of ``(key, current_usd, target_pct, actual_pct,
    desired_usd)``. Returns ``{key: buy_usd}`` summing to ``contribution``
    (floating-point within rounding).
    """
    if contribution <= 0:
        return {k: 0.0 for k, *_ in items}

    gaps: dict[str, float] = {}
    for key, current, _tgt, _act, desired in items:
        gaps[key] = max(0.0, desired - current)
    total_gap = sum(gaps.values())

    if total_gap >= contribution and total_gap > 0:
        return {k: contribution * g / total_gap for k, g in gaps.items()}

    # Full gap to everyone, then excess distributed among at-or-under-target.
    excess = contribution - total_gap
    under = [
        (key, tgt)
        for key, _cur, tgt, act, _des in items
        if act <= tgt + minor
    ]
    weight_sum = sum(w for _, w in under)

    buys = dict(gaps)
    if excess > 0 and under and weight_sum > 0:
        for key, w in under:
            buys[key] = buys.get(key, 0.0) + excess * w / weight_sum
    # else: excess stays unallocated (no at-or-under class with target > 0).
    # Caller decides whether that's an error; spec says 0 if sum==0 path.
    return buys


def compute_new_money(
    result: AllocationResult,
    targets: dict[str, float],
    contribution_usd: float,
    *,
    drift_minor_pct: float,
) -> RebalanceResult:
    """Distribute ``contribution_usd`` by gap-fill then proportional excess."""
    if not math.isfinite(contribution_usd) or contribution_usd <= 0:
        raise ValueError(
            f"contribution_usd must be positive and finite, got {contribution_usd!r}"
        )

    total = result.total
    if not _has_root_targets(targets):
        return RebalanceResult(
            mode="new_money",
            total=total,
            contribution_usd=contribution_usd,
            moves=[],
        )

    new_total = total + contribution_usd

    l1_items: list[tuple[str, float, float, float, float]] = []
    l1_slice_by_name: dict[str, AllocationSlice] = {}
    for ac_slice in result.by_asset_class:
        ac = ac_slice.name
        tgt = targets.get(ac)
        if tgt is None:
            continue
        desired = tgt / 100.0 * new_total
        current = ac_slice.value
        actual_pct = ac_slice.pct
        l1_items.append((ac, current, tgt, actual_pct, desired))
        l1_slice_by_name[ac] = ac_slice

    l1_buys = _allocate_new_money(l1_items, contribution_usd, drift_minor_pct)

    moves: list[RebalanceMove] = []
    for ac, current, tgt, actual_pct, _desired in l1_items:
        buy = l1_buys.get(ac, 0.0)
        ac_slice = l1_slice_by_name[ac]
        drift_pct = tgt - actual_pct

        children: list[RebalanceMove] = []
        if _has_group_targets(ac, targets) and buy > 0:
            currents = _l2_currents(ac, ac_slice, targets)
            new_parent_total = ac_slice.value + buy
            l2_items: list[tuple[str, float, float, float, float]] = []
            for sub_path, (cur_usd, cur_pct) in currents.items():
                t2 = targets[sub_path]
                desired2 = t2 / 100.0 * new_parent_total
                l2_items.append((sub_path, cur_usd, t2, cur_pct, desired2))

            l2_buys = _allocate_new_money(l2_items, buy, drift_minor_pct)
            for sub_path, cur_usd, t2, cur_pct, _d2 in l2_items:
                b2 = l2_buys.get(sub_path, 0.0)
                drift2 = t2 - cur_pct
                children.append(
                    RebalanceMove(
                        path=sub_path,
                        direction=_direction_new_money(drift2, b2, drift_minor_pct),
                        delta_usd=b2,
                        target_pct=t2,
                        actual_pct=cur_pct,
                        parent_total_usd=ac_slice.value,
                        children=[],
                    )
                )

        moves.append(
            RebalanceMove(
                path=ac,
                direction=_direction_new_money(drift_pct, buy, drift_minor_pct),
                delta_usd=buy,
                target_pct=tgt,
                actual_pct=actual_pct,
                parent_total_usd=total,
                children=children,
            )
        )

    return RebalanceResult(
        mode="new_money",
        total=total,
        contribution_usd=contribution_usd,
        moves=moves,
    )
