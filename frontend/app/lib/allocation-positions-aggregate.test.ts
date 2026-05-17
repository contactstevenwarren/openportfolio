import { describe, expect, it } from "vitest";

import type { PositionContribution } from "@/app/lib/api";
import {
  aggregatePositionsByTicker,
  filterPositionsForTickerSearch,
  sortAggregatedRows,
} from "@/app/lib/allocation-positions-aggregate";

function pos(p: Partial<PositionContribution> & Pick<PositionContribution, "ticker" | "account_id" | "account_name" | "contributing_value">): PositionContribution {
  return {
    share_of_slice: 0,
    share_of_portfolio: 0,
    is_partial: false,
    classification_source: "yaml",
    ...p,
  };
}

describe("aggregatePositionsByTicker", () => {
  it("sums two accounts for same ticker and labels accounts", () => {
    const rows = aggregatePositionsByTicker(
      [
        pos({
          ticker: "VTI",
          account_id: 1,
          account_name: "Schwab",
          contributing_value: 30_000,
          share_of_slice: 0.6,
          share_of_portfolio: 0.06,
        }),
        pos({
          ticker: "VTI",
          account_id: 2,
          account_name: "Fidelity",
          contributing_value: 20_000,
          share_of_slice: 0.4,
          share_of_portfolio: 0.04,
        }),
      ],
      50_000,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ticker).toBe("VTI");
    expect(rows[0]!.contributing_value).toBe(50_000);
    expect(rows[0]!.share_of_portfolio).toBeCloseTo(0.1, 6);
    expect(rows[0]!.share_of_slice).toBeCloseTo(1, 6);
    expect(rows[0]!.accountLabel).toBe("2 accounts");
  });

  it("uses 1 account label for a single line", () => {
    const rows = aggregatePositionsByTicker(
      [
        pos({
          ticker: "VXUS",
          account_id: 1,
          account_name: "Schwab",
          contributing_value: 12_000,
          share_of_slice: 1,
          share_of_portfolio: 0.024,
        }),
      ],
      12_000,
    );
    expect(rows[0]!.accountLabel).toBe("1 account");
  });

  it("ORs is_partial across lines", () => {
    const rows = aggregatePositionsByTicker(
      [
        pos({
          ticker: "X",
          account_id: 1,
          account_name: "A",
          contributing_value: 100,
          is_partial: false,
        }),
        pos({
          ticker: "X",
          account_id: 2,
          account_name: "B",
          contributing_value: 50,
          is_partial: true,
        }),
      ],
      150,
    );
    expect(rows[0]!.is_partial).toBe(true);
  });
});

describe("filterPositionsForTickerSearch", () => {
  const positions = [
    pos({
      ticker: "VTI",
      account_id: 1,
      account_name: "Schwab IRA",
      contributing_value: 15_000,
    }),
    pos({
      ticker: "VTI",
      account_id: 2,
      account_name: "Fidelity taxable",
      contributing_value: 10_000,
    }),
    pos({
      ticker: "VXUS",
      account_id: 1,
      account_name: "Schwab IRA",
      contributing_value: 12_000,
    }),
  ];

  it("includes all lines for a ticker when any line matches account name", () => {
    const filtered = filterPositionsForTickerSearch(positions, "fidelity");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((p) => p.ticker === "VTI")).toBe(true);
    expect(filtered.reduce((s, p) => s + p.contributing_value, 0)).toBe(25_000);
  });

  it("returns all rows when query empty", () => {
    expect(filterPositionsForTickerSearch(positions, "")).toEqual(positions);
    expect(filterPositionsForTickerSearch(positions, "   ")).toEqual(positions);
  });
});

describe("sortAggregatedRows", () => {
  it("sorts by contributing_value desc", () => {
    const sorted = sortAggregatedRows(
      [
        { ticker: "A", accountLabel: "1 account", contributing_value: 1, share_of_slice: 0, share_of_portfolio: 0, is_partial: false },
        { ticker: "B", accountLabel: "1 account", contributing_value: 99, share_of_slice: 0, share_of_portfolio: 0, is_partial: false },
      ],
      "contributing_value",
      "desc",
    );
    expect(sorted.map((r) => r.ticker)).toEqual(["B", "A"]);
  });
});
