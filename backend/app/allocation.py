"""Allocation engine (docs/architecture.md effective allocation engine).

For every position:
  - resolve its dollar value (market_value → cost_basis → 0)
  - look the ticker up in ``data/classifications.yaml``
  - optionally pull a fund breakdown from ``lookthrough.get_breakdown``
  - distribute the dollars across asset_class / sub_class / sector / region
    buckets using the fund's weights (or 100% to the ticker's own
    classification when there's no breakdown)

Ring layout for the sunburst:
    Ring 1  asset_class   (equity / fixed_income / real_estate / ...)
    Ring 2  region        (US / intl_developed / emerging / global / other)
    Ring 3  sub_class     (us_large_cap / us_aggregate / cd / direct / ...)

Each ring carries a single consistent meaning across every parent --
what / where / what-kind. Sector is intentionally not in the tree
(equity-only, low-signal for v0.1).

The 5-number summary is computed from the ring-1 totals with special
handling for equity split by region (via either fund breakdown or ticker
classification). Math lives here, never in the LLM.
"""

from collections import defaultdict
from collections.abc import Generator, Iterable

from sqlalchemy.orm import Session

from .classifications import ClassificationEntry, classify
from .lookthrough import Breakdown, get_breakdown
from .models import Position
from .schemas import AllocationResult, AllocationSlice, FiveNumberSummary

# Asset classes treated as "alternatives" for the 5-number summary.
ALTS_CLASSES = frozenset({"real_estate", "commodity", "crypto", "private"})

# Used when a fund's breakdown has weight for a dimension but not an
# exact match (e.g. a bond fund with no sector data). Dollars still need
# to land somewhere in the ring so the ring total matches the asset
# class total.
UNSPECIFIED = "other"


def position_value(position: Position) -> float:
    if position.market_value is not None:
        return position.market_value
    if position.cost_basis is not None:
        return position.cost_basis
    return 0.0


def _bucket_weights(
    weights: dict[str, float], value: float
) -> Iterable[tuple[str, float]]:
    """Yield (bucket, dollar_amount) for the dimension.

    Missing or empty weights collapse to a single "other" bucket carrying
    the full ``value`` so ring totals stay consistent with ring-1.
    """
    if not weights:
        yield (UNSPECIFIED, value)
        return
    total = sum(weights.values())
    if total <= 0:
        yield (UNSPECIFIED, value)
        return
    for bucket, w in weights.items():
        yield (bucket, value * (w / total))


def _classification_weights(
    entry: ClassificationEntry,
) -> tuple[dict[str, float], dict[str, float], dict[str, float], dict[str, float]]:
    """Build a Breakdown-shaped 4-tuple from a single-ticker classification.

    100% to each non-null dimension; empty dict otherwise so the
    dimension falls into the "other" bucket downstream.
    """
    asset_class = {entry.asset_class: 1.0}
    sub_class = {entry.sub_class: 1.0} if entry.sub_class else {}
    sector = {entry.sector: 1.0} if entry.sector else {}
    region = {entry.region: 1.0} if entry.region else {}
    return asset_class, sub_class, sector, region


# ---------------------------------------------------------------------------
# Per-position contribution record — shared math for aggregate() and
# positions_for_slice().  The generator owns weight resolution so the
# distribution logic is defined exactly once.
# ---------------------------------------------------------------------------

class _Contribution:
    """One (position, ac, reg, sc, dollars) tuple from the weight fan-out."""

    __slots__ = (
        "position",
        "entry",
        "ac_bucket",
        "reg_bucket",
        "sc_bucket",
        "dollars",
        "is_partial",
    )

    def __init__(
        self,
        position: Position,
        entry: ClassificationEntry,
        ac_bucket: str,
        reg_bucket: str,
        sc_bucket: str,
        dollars: float,
        is_partial: bool,
    ) -> None:
        self.position = position
        self.entry = entry
        self.ac_bucket = ac_bucket
        self.reg_bucket = reg_bucket
        self.sc_bucket = sc_bucket
        self.dollars = dollars
        self.is_partial = is_partial


def _per_position_contributions(
    positions: list[Position],
    classifications: dict[str, ClassificationEntry],
    db: Session | None = None,
    non_investable_account_ids: frozenset[int] | None = None,
) -> Generator[_Contribution, None, None]:
    """Yield one _Contribution per (position × ac_bucket × reg_bucket × sc_bucket).

    This is the canonical math for splitting position dollars into the 3-ring
    tree.  Both aggregate() and positions_for_slice() rely on it — changing
    the weight logic here changes both endpoints consistently.

    Positions that are unclassified, zero-value, or non-investable are skipped.
    ``is_partial`` is True when the fund's asset_class weights have more than
    one bucket or any single bucket weight < 1 (i.e. a multi-class fund).
    """
    for p in positions:
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

        br: Breakdown | None = (
            None if entry.source == "user" else get_breakdown(p.ticker, db=db)
        )
        if br is not None:
            ac_w, sc_w, _sec_w, reg_w = (
                br.asset_class,
                br.sub_class,
                br.sector,
                br.region,
            )
            is_partial = len(ac_w) > 1 or any(w < 1.0 - 1e-9 for w in ac_w.values())
        else:
            ac_w, sc_w, _sec_w, reg_w = _classification_weights(entry)
            is_partial = False

        for ac_bucket, ac_value in _bucket_weights(ac_w, value):
            for reg_bucket, reg_value in _bucket_weights(reg_w, ac_value):
                for sc_bucket, sc_value in _bucket_weights(sc_w, reg_value):
                    yield _Contribution(
                        position=p,
                        entry=entry,
                        ac_bucket=ac_bucket,
                        reg_bucket=reg_bucket,
                        sc_bucket=sc_bucket,
                        dollars=sc_value,
                        is_partial=is_partial,
                    )


# ---------------------------------------------------------------------------
# positions_for_slice — backing the drill-down panel endpoint
# ---------------------------------------------------------------------------

class SlicePosition:
    """One row in the drill panel: (account, ticker) → contributing dollars."""

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
    """Return value of positions_for_slice."""

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
    account_names: dict[int, str] | None = None,
    portfolio_total: float = 0.0,
) -> SlicePositionsResult:
    """Return per-position contributions to a given asset_class + optional L2 filter.

    The L2 filter matches against reg_bucket (region ring) first, which is
    what meaningful_children() surfaces for most classes.  For classes where
    meaningful_children() collapsed through to sub_class, the caller may pass
    the sc_bucket name; this function matches against both reg and sc buckets.

    ``portfolio_total`` should be aggregate().total so share_of_portfolio
    fractions reconcile exactly with the donut percentages.
    """
    # key: (account_id, ticker) → accumulated dollars + metadata
    rows: dict[tuple[int, str], dict] = {}

    # Count unclassified separately — generator skips them.
    unclassified_count = sum(
        1 for p in positions if classify(p.ticker, classifications) is None
    )
    source_counts: dict[str, int] = defaultdict(int)

    for contrib in _per_position_contributions(
        positions, classifications, db=db,
        non_investable_account_ids=non_investable_account_ids,
    ):
        if contrib.ac_bucket != asset_class:
            continue
        if l2 is not None and contrib.reg_bucket != l2 and contrib.sc_bucket != l2:
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


# ---------------------------------------------------------------------------
# aggregate — original single-pass algorithm, unchanged output contract
# ---------------------------------------------------------------------------

def aggregate(
    positions: list[Position],
    classifications: dict[str, ClassificationEntry],
    db: Session | None = None,
    non_investable_account_ids: frozenset[int] | None = None,
) -> AllocationResult:
    """Produce the 3-ring + 5-number payload for the hero screen."""
    # Nested dict: [asset_class][region][sub_class] -> dollars
    tree: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(float))
    )
    tickers_by_asset: dict[str, list[str]] = defaultdict(list)

    # Separate accumulators for the 5-number summary. equity splits by
    # region (US / intl_*); everything else just tracks asset class.
    totals_by_asset: dict[str, float] = defaultdict(float)
    equity_by_region: dict[str, float] = defaultdict(float)
    equity_by_sector: dict[str, float] = defaultdict(float)

    unclassified: list[str] = []
    # Per-ticker classification provenance. Surfaced on the allocation
    # response so the sunburst hover can show "classified as: X (your
    # override)" vs. the bundled YAML default. Multiple positions on the
    # same ticker share one source entry -- the classification is a
    # property of the ticker, not the position.
    classification_sources: dict[str, str] = {}
    # ``total`` is the Investment Portfolio (drives every percentage and
    # rebalance suggestion); ``assets_total`` is the full sum across every
    # classified position regardless of the investable flag.
    # The caller in get_allocation() subtracts liabilities to produce the
    # true net_worth — aggregate() itself knows nothing about liabilities.
    total = 0.0
    assets_total = 0.0

    for p in positions:
        entry = classify(p.ticker, classifications)
        if entry is None:
            unclassified.append(p.ticker)
            continue
        classification_sources[p.ticker] = entry.source
        value = position_value(p)
        if value <= 0:
            # Still record the ticker under its asset class so the
            # breakdown table reflects positions that have no dollars
            # attached yet (e.g. pre-market-value commit).
            tickers_by_asset[entry.asset_class].append(p.ticker)
            continue
        assets_total += value
        if non_investable_account_ids and p.account_id in non_investable_account_ids:
            # Account-level exclusion: counts toward Net Worth but not
            # Investment Portfolio. Same semantics as position-level flag.
            continue
        if p.investable is False:
            # Counts toward Net worth but not Investment Portfolio. The
            # ticker appears in /positions only -- we deliberately keep
            # it out of tickers_by_asset so the ring/breakdown stay
            # clean. ``is False`` (not ``not p.investable``) so unflushed
            # ORM instances with the attribute still None default to
            # investable.
            continue
        total += value

        # Prefer fund-level breakdown when available. Sector feeds the
        # equity sector_breakdown accumulator below; it's intentionally
        # not in the ring tree (equity-only, low-signal for v0.1).
        #
        # A user-owned classification wins over the lookthrough: the
        # user's intent is "classify this ticker this way" which, for a
        # fund, means suppress the decomposition and treat the dollars
        # as a single bucket. Non-user entries (yaml/prefix) always
        # defer to the richer fund-level breakdown.
        br: Breakdown | None = (
            None if entry.source == "user" else get_breakdown(p.ticker, db=db)
        )
        if br is not None:
            ac_w, sc_w, sec_w, reg_w = (
                br.asset_class,
                br.sub_class,
                br.sector,
                br.region,
            )
        else:
            ac_w, sc_w, sec_w, reg_w = _classification_weights(entry)

        tickers_by_asset.setdefault(entry.asset_class, [])
        tickers_by_asset[entry.asset_class].append(p.ticker)

        for ac_bucket, ac_value in _bucket_weights(ac_w, value):
            totals_by_asset[ac_bucket] += ac_value
            # Ring-2 = region; Ring-3 = sub_class. Both fall back to a
            # single "other" bucket when the weights are missing so the
            # ring totals still match ring-1.
            for reg_bucket, reg_value in _bucket_weights(reg_w, ac_value):
                for sc_bucket, sc_value in _bucket_weights(sc_w, reg_value):
                    tree[ac_bucket][reg_bucket][sc_bucket] += sc_value

            # Equity-only sector rollup. Skip when the fund has no
            # sector data (e.g. bond sleeve of a target-date fund, or
            # an equity ticker with no sector in classifications.yaml)
            # -- don't route missing data to "other" here; an empty
            # sector_breakdown is the correct signal to the UI.
            if ac_bucket == "equity" and sec_w:
                for sec_bucket, sec_value in _bucket_weights(sec_w, ac_value):
                    equity_by_sector[sec_bucket] += sec_value

            if ac_bucket == "equity":
                # Equity region split for the 5-number summary uses the
                # region weights (fund-level when available, else the
                # classification's region). Fall back to "US" if neither
                # provides one -- keeps the sum tight without inventing
                # an "unknown" bucket on the hero strip.
                if reg_w:
                    for reg_bucket, reg_value in _bucket_weights(
                        reg_w, ac_value
                    ):
                        equity_by_region[reg_bucket or "US"] += reg_value
                else:
                    equity_by_region[entry.region or "US"] += ac_value

    # --- shape into AllocationSlice tree ----------------------------------

    # Include asset classes that have positions but zero dollars so the
    # breakdown still surfaces them (e.g. a commodity ticker committed
    # with no cost basis yet).
    for ac_bucket in tickers_by_asset:
        tree.setdefault(ac_bucket, defaultdict(lambda: defaultdict(float)))

    by_asset_class: list[AllocationSlice] = []
    for ac_bucket, region_tree in tree.items():
        ac_value = sum(
            v
            for sub_tree in region_tree.values()
            for v in sub_tree.values()
        )
        region_slices: list[AllocationSlice] = []
        for reg_bucket, sub_tree in region_tree.items():
            reg_value = sum(sub_tree.values())
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
            region_slices.append(
                AllocationSlice(
                    name=reg_bucket,
                    value=reg_value,
                    pct=(100 * reg_value / total) if total > 0 else 0.0,
                    children=sub_slices,
                )
            )
        region_slices.sort(key=lambda s: s.value, reverse=True)
        by_asset_class.append(
            AllocationSlice(
                name=ac_bucket,
                value=ac_value,
                pct=(100 * ac_value / total) if total > 0 else 0.0,
                tickers=_dedup(tickers_by_asset.get(ac_bucket, [])),
                children=region_slices,
            )
        )
    by_asset_class.sort(key=lambda s: s.value, reverse=True)

    # Attach equity sector rollup (sorted desc by dollars) to the
    # equity top-level slice only. Every other slice keeps the
    # default empty list.
    sector_slices = [
        AllocationSlice(
            name=name,
            value=v,
            pct=(100 * v / total) if total > 0 else 0.0,
        )
        for name, v in sorted(
            equity_by_sector.items(), key=lambda kv: kv[1], reverse=True
        )
        if v > 0
    ]
    for s in by_asset_class:
        if s.name == "equity":
            s.sector_breakdown = sector_slices
            break

    # --- 5-number summary -------------------------------------------------

    def pct_of(x: float) -> float:
        return 100 * x / total if total > 0 else 0.0

    cash_pct = pct_of(totals_by_asset.get("cash", 0.0))
    us_equity_pct = pct_of(equity_by_region.get("US", 0.0))
    intl_equity_pct = pct_of(
        sum(v for region, v in equity_by_region.items() if region != "US")
    )
    alts_pct = pct_of(sum(totals_by_asset.get(c, 0.0) for c in ALTS_CLASSES))

    summary = FiveNumberSummary(
        net_worth=assets_total,
        cash_pct=cash_pct,
        us_equity_pct=us_equity_pct,
        intl_equity_pct=intl_equity_pct,
        alts_pct=alts_pct,
    )

    return AllocationResult(
        total=total,
        assets_total=assets_total,
        # net_worth and liabilities_total are patched by the caller
        # (get_allocation, _write_snapshot) after querying the liabilities
        # table. aggregate() is intentionally unaware of liabilities.
        net_worth=assets_total,
        liabilities_total=0.0,
        by_asset_class=by_asset_class,
        unclassified_tickers=_dedup(unclassified),
        summary=summary,
        classification_sources=classification_sources,
    )


def meaningful_children(slice: AllocationSlice) -> list[AllocationSlice]:
    """Walk down through single-child layers, returning the first level
    with more than one child (or a singleton list of the deepest node
    when all layers are single-child, including leaf nodes).

    Server mirror of the frontend's ``meaningfulChildren()``. Defines
    the L2 axis for any asset class:
    - Equity / FI / RE with multiple regions: returns region slices
    - Cash / Crypto / Commodity / Private (single "other" region):
      collapses through and returns sub_class slices
    - Single-sub_class cases (e.g. FI with only us_aggregate in one region):
      returns a singleton list of that sub_class slice

    Used by drift, rebalance, and the targets validator to compute the
    canonical L2 paths for a given asset class uniformly.
    """
    cur = slice
    while len(cur.children) == 1:
        cur = cur.children[0]
    # If we reached a leaf (no children), return the leaf itself as a singleton.
    # This handles single-sub_class cases (e.g. only us_aggregate in FI).
    if not cur.children:
        return [cur]
    return list(cur.children)


def _dedup(items: list[str]) -> list[str]:
    seen: set[str] = set()
    return [x for x in items if not (x in seen or seen.add(x))]
