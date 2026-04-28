"""Target drift vs live allocation (v0.2, 4-band redesign).

Math only: compares ``aggregate()`` slices to persisted ``targets`` rows.

Bands (by absolute drift in pp):
* ``ok``      -- |d| <= tolerance        (no-trade, hold)
* ``watch``   -- tolerance < |d| <= act
* ``act``     -- act < |d| <= urgent
* ``urgent``  -- |d| > urgent
"""

from collections import defaultdict

from .schemas import AllocationResult, AllocationSlice, DriftBand


def _band(
    drift_pct: float, tolerance: float, act: float, urgent: float
) -> DriftBand:
    a = abs(drift_pct)
    if a <= tolerance:
        return "ok"
    if a <= act:
        return "watch"
    if a <= urgent:
        return "act"
    return "urgent"


def _band_rank(b: DriftBand) -> int:
    return {"urgent": 4, "act": 3, "watch": 2, "ok": 1}[b]


def _has_root_targets(targets: dict[str, float]) -> bool:
    return any("." not in p for p in targets)


def _has_group_targets(asset_class: str, targets: dict[str, float]) -> bool:
    prefix = f"{asset_class}."
    return any(p.startswith(prefix) for p in targets)


def _non_equity_subclass_actuals(
    ac_slice: AllocationSlice,
) -> dict[str, float]:
    """Map sub_class name -> % of parent asset class (0..100).

    L2 targets are ``% of parent asset class``, so actuals must be
    computed against ``ac_slice.value``, not the portfolio total.
    """
    pct_by_sub: dict[str, float] = defaultdict(float)
    parent = ac_slice.value
    if parent <= 0:
        return {}
    for reg in ac_slice.children:
        for leaf in reg.children:
            if leaf.value > 0:
                pct_by_sub[leaf.name] += 100.0 * leaf.value / parent
    return dict(pct_by_sub)


def _leaf_drifts_non_equity(
    ac: str,
    leaf: AllocationSlice,
    targets: dict[str, float],
    tolerance: float,
    act: float,
    urgent: float,
    *,
    group_on: bool,
    actual_pct_for_sub: float,
) -> AllocationSlice:
    path = f"{ac}.{leaf.name}"
    if not group_on:
        return leaf.model_copy(
            update={"target_pct": None, "drift_pct": None, "drift_band": None},
            deep=False,
        )
    tgt = targets.get(path)
    if tgt is None:
        return leaf.model_copy(
            update={"target_pct": None, "drift_pct": None, "drift_band": None},
            deep=False,
        )
    drift = actual_pct_for_sub - tgt
    band = _band(drift, tolerance, act, urgent)
    return leaf.model_copy(
        update={
            "target_pct": tgt,
            "drift_pct": drift,
            "drift_band": band,
        },
        deep=False,
    )


def _map_region_subtree(
    ac: str,
    region_slice: AllocationSlice,
    targets: dict[str, float],
    tolerance: float,
    act: float,
    urgent: float,
    *,
    equity_drill_on: bool,
    group_on: bool,
    non_equity_agg: dict[str, float] | None,
    parent_value: float,
) -> AllocationSlice:
    if ac == "equity":
        path = f"{ac}.{region_slice.name}"
        if equity_drill_on:
            tgt = targets.get(path)
            if tgt is not None:
                # L2 equity targets are ``% of equity``, so compare
                # against region_value / equity_value, not / total.
                actual = (
                    100.0 * region_slice.value / parent_value
                    if parent_value > 0
                    else 0.0
                )
                drift = actual - tgt
                band = _band(drift, tolerance, act, urgent)
                reg_u = {
                    "target_pct": tgt,
                    "drift_pct": drift,
                    "drift_band": band,
                }
            else:
                reg_u = {
                    "target_pct": None,
                    "drift_pct": None,
                    "drift_band": None,
                }
        else:
            reg_u = {
                "target_pct": None,
                "drift_pct": None,
                "drift_band": None,
            }
        new_children = [
            c.model_copy(
                update={
                    "target_pct": None,
                    "drift_pct": None,
                    "drift_band": None,
                },
                deep=False,
            )
            for c in region_slice.children
        ]
        return region_slice.model_copy(update={**reg_u, "children": new_children}, deep=False)

    new_children = [
        _leaf_drifts_non_equity(
            ac,
            leaf,
            targets,
            tolerance,
            act,
            urgent,
            group_on=group_on,
            actual_pct_for_sub=(non_equity_agg or {}).get(leaf.name, 0.0),
        )
        for leaf in region_slice.children
    ]
    return region_slice.model_copy(update={"children": new_children}, deep=False)


def apply_drift(
    result: AllocationResult,
    targets: dict[str, float],
    *,
    drift_tolerance_pct: float,
    drift_act_pct: float,
    drift_urgent_pct: float,
) -> AllocationResult:
    """Return a copy of ``result`` with drift fields filled from ``targets``."""
    tolerance = drift_tolerance_pct
    act = drift_act_pct
    urgent = drift_urgent_pct
    root_on = _has_root_targets(targets)

    new_top: list[AllocationSlice] = []
    level1_drifts: list[tuple[float, DriftBand]] = []

    for ac_slice in result.by_asset_class:
        ac = ac_slice.name
        if root_on:
            rt = targets.get(ac)
            if rt is not None:
                drift = ac_slice.pct - rt
                band = _band(drift, tolerance, act, urgent)
                top_u = {
                    "target_pct": rt,
                    "drift_pct": drift,
                    "drift_band": band,
                }
                level1_drifts.append((abs(drift), band))
            else:
                top_u = {
                    "target_pct": None,
                    "drift_pct": None,
                    "drift_band": None,
                }
        else:
            top_u = {
                "target_pct": None,
                "drift_pct": None,
                "drift_band": None,
            }

        equity_drill = ac == "equity" and _has_group_targets("equity", targets)
        group_other = ac != "equity" and _has_group_targets(ac, targets)
        non_eq_agg = (
            _non_equity_subclass_actuals(ac_slice)
            if ac != "equity"
            else None
        )

        new_children = [
            _map_region_subtree(
                ac,
                reg,
                targets,
                tolerance,
                act,
                urgent,
                equity_drill_on=equity_drill,
                group_on=group_other,
                non_equity_agg=non_eq_agg,
                parent_value=ac_slice.value,
            )
            for reg in ac_slice.children
        ]

        new_sectors = [
            s.model_copy(
                update={
                    "target_pct": None,
                    "drift_pct": None,
                    "drift_band": None,
                },
                deep=False,
            )
            for s in ac_slice.sector_breakdown
        ]

        new_top.append(
            ac_slice.model_copy(
                update={**top_u, "children": new_children, "sector_breakdown": new_sectors},
                deep=False,
            )
        )

    max_drift: float | None = None
    max_band: DriftBand | None = None
    if level1_drifts:
        max_drift = max(d for d, _ in level1_drifts)
        candidates = [b for d, b in level1_drifts if abs(d - max_drift) < 1e-9]
        max_band = max(candidates, key=_band_rank)

    return result.model_copy(
        update={
            "by_asset_class": new_top,
            "max_drift": max_drift,
            "max_drift_band": max_band,
        },
        deep=False,
    )
