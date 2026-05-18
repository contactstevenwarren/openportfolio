"""Allocation engine (2-ring: asset_class → sub_class).

For every position:
  - resolve its dollar value (market_value → cost_basis → 0)
  - look the ticker up in merged seed YAML + user DB classifications
  - split dollars across weighted (asset_class, sub_class) buckets

Math lives here, never in the LLM.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Generator

from sqlalchemy.orm import Session

from .classifications import ClassificationEntry, classify, primary_asset_class
from .models import Position
from .schemas import AllocationResult, AllocationSlice

UNSPECIFIED = "other"


def position_value(position: Position) -> float:
    if position.market_value is not None:
        return position.market_value
    if position.cost_basis is not None:
        return position.cost_basis
    return 0.0


def _is_partial_fund(entry: ClassificationEntry) -> bool:
    return len(entry.buckets) > 1


class _Contribution:
    __slots__ = (
        "position",
        "entry",
        "ac_bucket",
        "sc_bucket",
        "dollars",
        "is_partial",
    )

    def __init__(
        self,
        position: Position,
        entry: ClassificationEntry,
        ac_bucket: str,
        sc_bucket: str,
        dollars: float,
        is_partial: bool,
    ) -> None:
        self.position = position
        self.entry = entry
        self.ac_bucket = ac_bucket
        self.sc_bucket = sc_bucket
        self.dollars = dollars
        self.is_partial = is_partial


def _per_position_contributions(
    positions: list[Position],
    classifications: dict[str, ClassificationEntry],
    db: Session | None = None,
    non_investable_account_ids: frozenset[int] | None = None,
    archived_account_ids: frozenset[int] | None = None,
) -> Generator[_Contribution, None, None]:
    del db  # reserved for API parity with callers
    for p in positions:
        if archived_account_ids and p.account_id in archived_account_ids:
            continue
        entry = classify(p.ticker, classifications)
        if entry is None:
            continue

        value = position_value(p)
        if value <= 0:
            continue

        if non_investable_account_ids and p.account_id in non_investable_account_ids:
            continue
        if p.investable is False:
            continue

        partial = _is_partial_fund(entry)
        for b in entry.buckets:
            sc = b.sub_class if b.sub_class else UNSPECIFIED
            yield _Contribution(
                position=p,
                entry=entry,
                ac_bucket=b.asset_class,
                sc_bucket=sc,
                dollars=value * b.weight,
                is_partial=partial,
            )


class SlicePosition:
    __slots__ = (
        "ticker",
        "account_id",
        "account_name",
        "contributing_value",
        "share_of_slice",
        "share_of_portfolio",
        "is_partial",
        "classification_source",
    )

    def __init__(
        self,
        ticker: str,
        account_id: int,
        account_name: str,
        contributing_value: float,
        share_of_slice: float,
        share_of_portfolio: float,
        is_partial: bool,
        classification_source: str,
    ) -> None:
        self.ticker = ticker
        self.account_id = account_id
        self.account_name = account_name
        self.contributing_value = contributing_value
        self.share_of_slice = share_of_slice
        self.share_of_portfolio = share_of_portfolio
        self.is_partial = is_partial
        self.classification_source = classification_source


class SlicePositionsResult:
    __slots__ = ("total", "portfolio_total", "positions", "source_counts", "unclassified_count")

    def __init__(
        self,
        total: float,
        portfolio_total: float,
        positions: list[SlicePosition],
        source_counts: dict[str, int],
        unclassified_count: int,
    ) -> None:
        self.total = total
        self.portfolio_total = portfolio_total
        self.positions = positions
        self.source_counts = source_counts
        self.unclassified_count = unclassified_count


def positions_for_slice(
    positions: list[Position],
    classifications: dict[str, ClassificationEntry],
    asset_class: str,
    l2: str | None = None,
    db: Session | None = None,
    non_investable_account_ids: frozenset[int] | None = None,
    archived_account_ids: frozenset[int] | None = None,
    account_names: dict[int, str] | None = None,
    portfolio_total: float = 0.0,
) -> SlicePositionsResult:
    """Per-position contributions to asset_class × optional sub_class (L2) slice."""
    rows: dict[tuple[int, str], dict] = {}

    unclassified_count = sum(
        1
        for p in positions
        if not (archived_account_ids and p.account_id in archived_account_ids)
        and classify(p.ticker, classifications) is None
    )
    source_counts: dict[str, int] = defaultdict(int)

    for contrib in _per_position_contributions(
        positions,
        classifications,
        db=db,
        non_investable_account_ids=non_investable_account_ids,
        archived_account_ids=archived_account_ids,
    ):
        if contrib.ac_bucket != asset_class:
            continue
        if l2 is not None and contrib.sc_bucket != l2:
            continue

        p = contrib.position
        key = (p.account_id, p.ticker)
        if key not in rows:
            rows[key] = {
                "account_id": p.account_id,
                "ticker": p.ticker,
                "contributing_value": 0.0,
                "is_partial": contrib.is_partial,
                "classification_source": contrib.entry.source,
            }
        rows[key]["contributing_value"] += contrib.dollars
        if contrib.is_partial:
            rows[key]["is_partial"] = True

    slice_total = sum(r["contributing_value"] for r in rows.values())
    acc_names = account_names or {}

    result_positions: list[SlicePosition] = []
    for row in sorted(rows.values(), key=lambda r: r["contributing_value"], reverse=True):
        source = row["classification_source"]
        source_counts[source] += 1
        result_positions.append(
            SlicePosition(
                ticker=row["ticker"],
                account_id=row["account_id"],
                account_name=acc_names.get(row["account_id"], f"Account {row['account_id']}"),
                contributing_value=row["contributing_value"],
                share_of_slice=(row["contributing_value"] / slice_total) if slice_total > 0 else 0.0,
                share_of_portfolio=(row["contributing_value"] / portfolio_total) if portfolio_total > 0 else 0.0,
                is_partial=row["is_partial"],
                classification_source=source,
            )
        )

    return SlicePositionsResult(
        total=slice_total,
        portfolio_total=portfolio_total,
        positions=result_positions,
        source_counts=dict(source_counts),
        unclassified_count=unclassified_count,
    )


def aggregate(
    positions: list[Position],
    classifications: dict[str, ClassificationEntry],
    db: Session | None = None,
    non_investable_account_ids: frozenset[int] | None = None,
    archived_account_ids: frozenset[int] | None = None,
) -> AllocationResult:
    del db
    # [asset_class][sub_class] -> dollars
    tree: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    tickers_by_asset: dict[str, list[str]] = defaultdict(list)

    unclassified: list[str] = []
    classification_sources: dict[str, str] = {}
    total = 0.0
    assets_total = 0.0

    for p in positions:
        if archived_account_ids and p.account_id in archived_account_ids:
            continue
        entry = classify(p.ticker, classifications)
        if entry is None:
            unclassified.append(p.ticker)
            continue
        classification_sources[p.ticker] = entry.source
        pac = primary_asset_class(entry)
        value = position_value(p)
        if value <= 0:
            tickers_by_asset[pac].append(p.ticker)
            continue
        assets_total += value
        if non_investable_account_ids and p.account_id in non_investable_account_ids:
            continue
        if p.investable is False:
            continue
        total += value

        for b in entry.buckets:
            ac_bucket = b.asset_class
            sc_bucket = b.sub_class if b.sub_class else UNSPECIFIED
            ac_value = value * b.weight
            tree[ac_bucket][sc_bucket] += ac_value

        tickers_by_asset.setdefault(pac, [])
        tickers_by_asset[pac].append(p.ticker)

    for ac_bucket in tickers_by_asset:
        tree.setdefault(ac_bucket, defaultdict(float))

    by_asset_class: list[AllocationSlice] = []
    for ac_bucket, sub_tree in tree.items():
        ac_value = sum(sub_tree.values())
        sub_slices = [
            AllocationSlice(
                name=sc_bucket,
                value=sc_value,
                pct=(100 * sc_value / total) if total > 0 else 0.0,
            )
            for sc_bucket, sc_value in sorted(
                sub_tree.items(), key=lambda kv: kv[1], reverse=True
            )
            if sc_value > 0
        ]
        by_asset_class.append(
            AllocationSlice(
                name=ac_bucket,
                value=ac_value,
                pct=(100 * ac_value / total) if total > 0 else 0.0,
                tickers=_dedup(tickers_by_asset.get(ac_bucket, [])),
                children=sub_slices,
            )
        )
    by_asset_class.sort(key=lambda s: s.value, reverse=True)

    return AllocationResult(
        total=total,
        assets_total=assets_total,
        net_worth=assets_total,
        liabilities_total=0.0,
        by_asset_class=by_asset_class,
        unclassified_tickers=_dedup(unclassified),
        classification_sources=classification_sources,
    )


def meaningful_children(slice: AllocationSlice) -> list[AllocationSlice]:
    """First level of meaningful drill under an asset-class slice (sub_class children)."""
    cur = slice
    while len(cur.children) == 1:
        cur = cur.children[0]
    if not cur.children:
        return [cur]
    return list(cur.children)


def _dedup(items: list[str]) -> list[str]:
    seen: set[str] = set()
    return [x for x in items if not (x in seen or seen.add(x))]
