"""Target drift vs live allocation (v0.2, unified meaningful_children redesign).

Math only: compares ``aggregate()`` slices to persisted ``targets`` rows.

L2 target paths now follow ``meaningful_children()`` semantics for every
asset class:
- Equity / FI / RE: targets key by region (``equity.US``, ``fixed_income.US``)
- Cash / Crypto / Commodity / Private: targets key by sub_class, reached by
  collapsing the single "other" region layer.

Bands (by absolute drift in pp):
* ``ok``      -- |d| <= tolerance        (no-trade, hold)
* ``watch``   -- tolerance < |d| <= act
* ``act``     -- act < |d| <= urgent
* ``urgent``  -- |d| > urgent
"""

from .allocation import meaningful_children
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


def _attach_drift_to_meaningful_child(
    node: AllocationSlice,
    target_name: str,
    target_pct: float,
    actual_pct: float,
    tolerance: float,
    act: float,
    urgent: float,
) -> AllocationSlice:
    """Return a copy of ``node`` with drift fields attached.

    ``actual_pct`` is already % of parent (0..100).
    """
    drift = actual_pct - target_pct
    band = _band(drift, tolerance, act, urgent)
    return node.model_copy(
        update={"target_pct": target_pct, "drift_pct": drift, "drift_band": band},
        deep=False,
    )


def _clear_drift(node: AllocationSlice) -> AllocationSlice:
    return node.model_copy(
        update={"target_pct": None, "drift_pct": None, "drift_band": None},
        deep=False,
    )


def _apply_l2_drift_to_ac(
    ac_slice: AllocationSlice,
    targets: dict[str, float],
    tolerance: float,
    act: float,
    urgent: float,
) -> AllocationSlice:
    """Attach L2 drift fields to whichever slices meaningful_children() returns.

    Strategy:
    1. Compute actual % of parent for each meaningful child.
    2. Walk the tree to find the node whose name matches the target path suffix.
    3. Attach drift to that node in a copy.

    The tree structure (asset_class → region → sub_class) is preserved in the
    output; only the nodes returned by meaningful_children() gain drift fields.
    All other nodes are cleared.
    """
    ac = ac_slice.name
    prefix = f"{ac}."
    parent_value = ac_slice.value

    # Build actual-pct map for the meaningful children.
    mc = meaningful_children(ac_slice)
    actual_by_name: dict[str, float] = {
        c.name: (100.0 * c.value / parent_value if parent_value > 0 else 0.0)
        for c in mc
    }
    # Set of target path names that apply to this asset class.
    l2_targets: dict[str, float] = {
        p[len(prefix):]: pct
        for p, pct in targets.items()
        if p.startswith(prefix)
    }

    # Walk the tree and annotate nodes that are in the meaningful-children set.
    # For equity: meaningful children = region slices (children of asset_class).
    # For cash etc.: meaningful children = sub_class slices (grandchildren,
    # reached through single "other" region).
    # We identify a node as a meaningful child if its name appears in mc_names.
    mc_names = {c.name for c in mc}

    def _annotate_region(region_slice: AllocationSlice) -> AllocationSlice:
        if region_slice.name in mc_names:
            # This region slice IS a meaningful child → may get drift.
            tgt = l2_targets.get(region_slice.name)
            actual = actual_by_name.get(region_slice.name, 0.0)
            updated_leaves = [_clear_drift(leaf) for leaf in region_slice.children]
            if tgt is not None:
                region_updated = _attach_drift_to_meaningful_child(
                    region_slice, region_slice.name, tgt, actual, tolerance, act, urgent
                )
                return region_updated.model_copy(update={"children": updated_leaves}, deep=False)
            else:
                cleared = _clear_drift(region_slice)
                return cleared.model_copy(update={"children": updated_leaves}, deep=False)
        else:
            # This region slice is NOT a meaningful child (it's the single "other"
            # wrapper). Walk into its sub_class children which ARE the meaningful ones.
            updated_leaves = []
            for leaf in region_slice.children:
                if leaf.name in mc_names:
                    tgt = l2_targets.get(leaf.name)
                    actual = actual_by_name.get(leaf.name, 0.0)
                    if tgt is not None:
                        updated_leaves.append(
                            _attach_drift_to_meaningful_child(
                                leaf, leaf.name, tgt, actual, tolerance, act, urgent
                            )
                        )
                    else:
                        updated_leaves.append(_clear_drift(leaf))
                else:
                    updated_leaves.append(_clear_drift(leaf))
            cleared_region = _clear_drift(region_slice)
            return cleared_region.model_copy(update={"children": updated_leaves}, deep=False)

    new_children = [_annotate_region(reg) for reg in ac_slice.children]

    new_sectors = [_clear_drift(s) for s in ac_slice.sector_breakdown]

    return ac_slice.model_copy(
        update={"children": new_children, "sector_breakdown": new_sectors},
        deep=False,
    )


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

        # Root (L1) drift.
        if root_on:
            rt = targets.get(ac)
            if rt is not None:
                drift = ac_slice.pct - rt
                band = _band(drift, tolerance, act, urgent)
                top_u: dict = {
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

        # L2 drift — applies uniformly to all asset classes via meaningful_children().
        if _has_group_targets(ac, targets):
            annotated = _apply_l2_drift_to_ac(
                ac_slice.model_copy(update=top_u, deep=False),
                targets,
                tolerance,
                act,
                urgent,
            )
            new_top.append(annotated)
        else:
            # No L2 targets for this class: clear all children and sector.
            cleared_children = []
            for reg in ac_slice.children:
                cleared_leaves = [_clear_drift(leaf) for leaf in reg.children]
                cleared_reg = _clear_drift(reg)
                cleared_children.append(
                    cleared_reg.model_copy(update={"children": cleared_leaves}, deep=False)
                )
            cleared_sectors = [_clear_drift(s) for s in ac_slice.sector_breakdown]
            new_top.append(
                ac_slice.model_copy(
                    update={
                        **top_u,
                        "children": cleared_children,
                        "sector_breakdown": cleared_sectors,
                    },
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
