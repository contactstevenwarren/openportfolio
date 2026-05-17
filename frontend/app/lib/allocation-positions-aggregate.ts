import type { PositionContribution } from "@/app/lib/api";

/** One row per ticker after aggregation (holdings drill — By ticker). */
export type AggregatedPositionRow = {
  ticker: string;
  /** Display copy: `1 account` or `N accounts`. */
  accountLabel: string;
  contributing_value: number;
  share_of_slice: number;
  share_of_portfolio: number;
  is_partial: boolean;
};

/**
 * For search in By ticker mode: include every line for tickers where at least
 * one line matched ticker or account name (full totals, not filter-within-ticker).
 */
export function filterPositionsForTickerSearch(
  positions: PositionContribution[],
  query: string,
): PositionContribution[] {
  const q = query.trim().toLowerCase();
  if (!q) return positions;
  const tickers = new Set(
    positions
      .filter(
        (p) =>
          p.ticker.toLowerCase().includes(q) ||
          p.account_name.toLowerCase().includes(q),
      )
      .map((p) => p.ticker),
  );
  return positions.filter((p) => tickers.has(p.ticker));
}

/**
 * Sum per ticker. `sliceTotal` is `PositionContributionsResponse.total` for the slice.
 */
export function aggregatePositionsByTicker(
  positions: PositionContribution[],
  sliceTotal: number,
): AggregatedPositionRow[] {
  const byTicker = new Map<string, PositionContribution[]>();
  for (const p of positions) {
    const arr = byTicker.get(p.ticker) ?? [];
    arr.push(p);
    byTicker.set(p.ticker, arr);
  }
  const rows: AggregatedPositionRow[] = [];
  for (const [ticker, lines] of byTicker.entries()) {
    const contributing_value = lines.reduce((s, x) => s + x.contributing_value, 0);
    const share_of_portfolio = lines.reduce((s, x) => s + x.share_of_portfolio, 0);
    const share_of_slice =
      sliceTotal > 0 ? contributing_value / sliceTotal : 0;
    const is_partial = lines.some((x) => x.is_partial);
    const n = lines.length;
    const accountLabel = n === 1 ? "1 account" : `${n} accounts`;
    rows.push({
      ticker,
      accountLabel,
      contributing_value,
      share_of_slice,
      share_of_portfolio,
      is_partial,
    });
  }
  return rows;
}

export type AggregatedSortKey =
  | "contributing_value"
  | "ticker"
  | "share_of_portfolio"
  | "share_of_slice";

export function sortAggregatedRows(
  rows: AggregatedPositionRow[],
  sortKey: AggregatedSortKey,
  sortDir: "asc" | "desc",
): AggregatedPositionRow[] {
  const mult = sortDir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (sortKey === "contributing_value" || sortKey === "share_of_portfolio" || sortKey === "share_of_slice") {
      return mult * (a[sortKey] - b[sortKey]);
    }
    return mult * a.ticker.localeCompare(b.ticker);
  });
}
