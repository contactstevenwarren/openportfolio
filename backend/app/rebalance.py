"""Rebalance math (v0.5 M1, 4-band redesign).

Pure functions over an already-built ``AllocationResult``. No I/O, no DB,
no HTTP. Two modes:

* ``full`` -- delta vs target for every L1 class (and nested L2 where
  group targets exist). Sum of L1 deltas is ~0. The drift band acts as
  a **global trigger**: if any class drifts past ``drift_act_pct`` (the
  ``act`` or ``urgent`` band), every class outside the ``ok`` band is
  restored to target (full restore, trades net to zero). Classes in
  the ``ok`` band (|drift| <= ``drift_tolerance_pct``) stay ``hold``
  even when the trigger fires. If no class is past the act band, every
  row is hold. When triggered, L2 rows decompose the parent L1 dollar
  move across sub-buckets (overweights lose first on sells; underweights
  gain first on buys) so child ``delta_usd`` sums to the parent move.
* ``new_money`` -- distribute a positive USD contribution by gap-fill
  first (``max(0, desired - current)``) and excess proportional to
  target percent among classes at or under target. No sells. Bands do
  not gate this mode.

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


def _direction_triggered(
    delta_usd: float, drift_pct: float, triggered: bool, tolerance: float
) -> RebalanceDirection:
    """Full-mode direction: hold unless the band trigger fired *and* this row is outside the ``ok`` band.

    Per the 4-band redesign: a class with |drift| <= ``tolerance`` is in
    the ``ok`` (no-trade) band and stays ``hold`` even when the
    portfolio-wide trigger fires. Classes in ``watch+`` get buy/sell
    when triggered.
    """
    if not triggered or abs(drift_pct) <= tolerance or abs(delta_usd) < 1.0:
        return "hold"
    return "buy" if delta_usd > 0 else "sell"


def _direction_decomposed(delta_usd: float) -> RebalanceDirection:
    """L2 under ``full`` mode: label from the decomposed dollar move only."""
    if abs(delta_usd) < 1e-9:
        return "hold"
    return "buy" if delta_usd > 0 else "sell"


def _decompose_l1_delta_into_l2(
    l1_delta: float,
    parent_value: float,
    currents: dict[str, tuple[float, float]],
    targets: dict[str, float],
) -> list[RebalanceMove]:
    """Split signed ``l1_delta`` across L2 paths so child deltas sum to ``l1_delta``.

    Sell (negative ``l1_delta``): weight each child by within-parent
    dollar overweight ``max(0, cur - desired)`` where
    ``desired = target_pct/100 * parent_value``. If all weights are
    zero, fall back to current ``cur`` weights.

    Buy (positive ``l1_delta``): weight by ``max(0, desired - cur)``;
    fallback to ``cur`` weights.

    ``actual_pct`` / ``target_pct`` on each child stay the slice view;
    only ``delta_usd`` and ``direction`` come from this split.
    """
    if not currents:
        return []

    entries: list[tuple[str, float, float, float]] = []
    for sub_path in sorted(currents.keys()):
        cur_usd, cur_pct = currents[sub_path]
        t2 = targets[sub_path]
        entries.append((sub_path, cur_usd, cur_pct, t2))

    if abs(l1_delta) < 1e-12:
        return [
            RebalanceMove(
                path=p,
                direction="hold",
                delta_usd=0.0,
                target_pct=t2,
                actual_pct=cur_pct,
                parent_total_usd=parent_value,
                children=[],
            )
            for p, _cur_usd, cur_pct, t2 in entries
        ]

    weights: list[float] = []
    for _p, cur_usd, _cur_pct, t2 in entries:
        desired = t2 / 100.0 * parent_value
        if l1_delta < 0:
            weights.append(max(0.0, cur_usd - desired))
        else:
            weights.append(max(0.0, desired - cur_usd))

    s = sum(weights)
    if s < 1e-12:
        weights = [e[1] for e in entries]  # cur_usd
        s = sum(weights)
    if s < 1e-12:
        weights = [1.0] * len(entries)
        s = float(len(entries))

    deltas = [l1_delta * w / s for w in weights]
    # Fix float drift on the largest-magnitude child.
    fix_i = max(range(len(deltas)), key=lambda i: abs(deltas[i]))
    total = sum(deltas)
    deltas[fix_i] += l1_delta - total

    out: list[RebalanceMove] = []
    for i, (p, _cur_usd, cur_pct, t2) in enumerate(entries):
        d_usd = deltas[i]
        out.append(
            RebalanceMove(
                path=p,
                direction=_direction_decomposed(d_usd),
                delta_usd=d_usd,
                target_pct=t2,
                actual_pct=cur_pct,
                parent_total_usd=parent_value,
                children=[],
            )
        )
    return out


def _direction_new_money(
    drift_pct: float, delta_usd: float, tolerance: float
) -> RebalanceDirection:
    # Spec: direction becomes "buy" unless the drift is in the no-trade
    # (``ok``) band and delta is 0, then "hold". delta_usd is always
    # >= 0 here.
    if delta_usd == 0.0 and abs(drift_pct) <= tolerance:
        return "hold"
    return "buy"


def compute_rebalance(
    result: AllocationResult,
    targets: dict[str, float],
    *,
    drift_tolerance_pct: float,
    drift_act_pct: float,
) -> RebalanceResult:
    """Full rebalance: deltas to realign every targeted class.

    Trigger fires when any L1 class is in the ``act`` or ``urgent``
    band (|drift| > ``drift_act_pct``). When triggered, classes in the
    ``ok`` band (|drift| <= ``drift_tolerance_pct``) stay ``hold``;
    everything else gets ``buy``/``sell``. When not triggered, every
    row is ``hold``.
    """
    total = result.total
    if total <= 0 or not _has_root_targets(targets):
        return RebalanceResult(mode="full", total=total, moves=[])

    # First pass: compute drift per class with a target.
    targeted: list[tuple[AllocationSlice, float, float, float]] = []
    for ac_slice in result.by_asset_class:
        target = targets.get(ac_slice.name)
        if target is None:
            continue
        actual_pct = ac_slice.pct
        drift_pct = target - actual_pct
        delta_usd = drift_pct / 100.0 * total
        targeted.append((ac_slice, target, drift_pct, delta_usd))

    # Trigger fires if any targeted class is in the ``act`` or ``urgent``
    # band -- i.e. |drift| > drift_act_pct. When triggered, every class
    # outside the ``ok`` band gets a real action; ``ok``-band classes
    # stay hold. When not triggered, every class is hold.
    triggered = any(abs(drift_pct) > drift_act_pct for _, _, drift_pct, _ in targeted)

    moves: list[RebalanceMove] = []
    for ac_slice, target, drift_pct, delta_usd in targeted:
        ac = ac_slice.name
        children: list[RebalanceMove] = []
        # Decompose L2 only when this row has a real action: trigger
        # fired, this class is outside the ok band, and delta > $1.
        if (
            triggered
            and abs(drift_pct) > drift_tolerance_pct
            and _has_group_targets(ac, targets)
            and abs(delta_usd) >= 1.0
        ):
            currents = _l2_currents(ac, ac_slice, targets)
            parent_value = ac_slice.value
            children = _decompose_l1_delta_into_l2(
                delta_usd, parent_value, currents, targets
            )

        moves.append(
            RebalanceMove(
                path=ac,
                direction=_direction_triggered(
                    delta_usd, drift_pct, triggered, drift_tolerance_pct
                ),
                delta_usd=delta_usd,
                target_pct=target,
                actual_pct=ac_slice.pct,
                parent_total_usd=total,
                children=children,
            )
        )

    return RebalanceResult(mode="full", total=total, moves=moves)


def _allocate_new_money(
    items: list[tuple[str, float, float, float, float]],
    contribution: float,
    tolerance: float,
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
        for key, _cur, tgt, actual, _des in items
        if actual <= tgt + tolerance
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
    drift_tolerance_pct: float,
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

    l1_buys = _allocate_new_money(l1_items, contribution_usd, drift_tolerance_pct)

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

            l2_buys = _allocate_new_money(l2_items, buy, drift_tolerance_pct)
            for sub_path, cur_usd, t2, cur_pct, _d2 in l2_items:
                b2 = l2_buys.get(sub_path, 0.0)
                drift2 = t2 - cur_pct
                children.append(
                    RebalanceMove(
                        path=sub_path,
                        direction=_direction_new_money(drift2, b2, drift_tolerance_pct),
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
                direction=_direction_new_money(drift_pct, buy, drift_tolerance_pct),
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
