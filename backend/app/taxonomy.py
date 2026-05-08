"""Locked allocation taxonomy (plain-English storage keys).

Every ``(asset_class, sub_class)`` pair on classification buckets must
appear in ``TAXONOMY``. Non-canonical rows are rejected at API / ORM
boundaries. Bundled ``data/classifications.yaml`` uses these strings
directly (flat rows or explicit ``buckets`` lists).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable

# L1 -> allowed L2 labels (exact strings everywhere: DB, API, YAML, targets).
TAXONOMY: dict[str, tuple[str, ...]] = {
    "Stocks": (
        "US Stocks",
        "International Developed",
        "International Emerging",
    ),
    "Bonds": (
        "US Treasury",
        "US Corporate",
        "US Municipal",
        "International Bonds",
        "Emerging Markets Debt",
    ),
    "Real Estate": (
        "REITs",
        "Primary Residence",
        "Rental Property",
    ),
    "Commodities": (
        "Gold",
        "Silver",
        "Energy",
        "Other Commodities",
    ),
    "Crypto": (
        "Bitcoin",
        "Ethereum",
        "Other Crypto",
    ),
    "Cash": (
        "Cash & Savings",
        "Money Market",
        "CDs",
    ),
    "Private": (
        "Private Equity",
        "Private Debt",
    ),
}

TAXONOMY_L1_ORDER: tuple[str, ...] = tuple(TAXONOMY.keys())

ALL_ALLOWED_PAIRS: frozenset[tuple[str, str]] = frozenset(
    (ac, sc) for ac, subs in TAXONOMY.items() for sc in subs
)


def is_allowed_pair(asset_class: str, sub_class: str | None) -> bool:
    if not sub_class:
        return False
    return (asset_class, sub_class) in ALL_ALLOWED_PAIRS


def target_path_is_valid(path: str) -> bool:
    if "." not in path:
        return path in TAXONOMY
    ac, rest = path.split(".", 1)
    if ac not in TAXONOMY:
        return False
    return rest in TAXONOMY[ac]


def taxonomy_options_for_api() -> tuple[list[tuple[str, str]], dict[str, list[tuple[str, str]]]]:
    """(asset_class rows as (value,label), sub_classes_by_class as value->[(v,l),...])."""
    ac_rows = [(k, k) for k in TAXONOMY_L1_ORDER]
    subs: dict[str, list[tuple[str, str]]] = {
        k: [(s, s) for s in TAXONOMY[k]] for k in TAXONOMY_L1_ORDER
    }
    return ac_rows, subs


def consolidate_buckets(
    buckets: Iterable[tuple[str, str, float]],
) -> list[tuple[str, str, float]]:
    acc: dict[tuple[str, str], float] = defaultdict(float)
    for ac, sc, w in buckets:
        if w <= 0:
            continue
        acc[(ac, sc)] += w
    tot = sum(acc.values())
    if tot <= 0:
        return []
    return [(a, s, wt / tot) for (a, s), wt in sorted(acc.items())]


def merge_canonical_bucket_rows(
    rows: list[tuple[str, str | None, float]],
) -> list[tuple[str, str, float]]:
    """Merge duplicate (L1, L2) keys and renormalize weights to sum 1.

    Every row must already use canonical ``TAXONOMY`` labels.
    """
    pre: list[tuple[str, str, float]] = []
    for ac, sc, w in rows:
        if sc is None or (isinstance(sc, str) and not str(sc).strip()):
            raise ValueError(f"sub_class is required for asset_class {ac!r}")
        sc2 = str(sc).strip()
        if not is_allowed_pair(ac, sc2):
            raise ValueError(f"invalid taxonomy pair ({ac!r}, {sc2!r})")
        pre.append((ac, sc2, float(w)))
    merged = consolidate_buckets(pre)
    s = sum(t[2] for t in merged)
    if s <= 0:
        return []
    drift = 1.0 - s
    if merged and abs(drift) > 1e-9:
        a, sc3, w0 = merged[-1]
        merged[-1] = (a, sc3, max(0.0, w0 + drift))
    return merged


def assert_valid_buckets(buckets: list[tuple[str, str, float]]) -> None:
    for ac, sc, w in buckets:
        if not is_allowed_pair(ac, sc):
            raise ValueError(f"invalid taxonomy pair ({ac!r}, {sc!r})")
        if w < 0 or w > 1.0 + 1e-6:
            raise ValueError(f"invalid weight {w} for {ac}/{sc}")
