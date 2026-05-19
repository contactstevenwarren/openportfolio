import type { AssetClass } from "@/app/lib/api";

export type { AssetClass };

export type Freshness = {
  source: string;
  confidence?: number | null;
  capturedAt?: string | null;
};

export type AllocationSlice = {
  class: AssetClass;
  label: string;
  value: number;
  pct: number;
  targetPct?: number;
  gap?: number;
  freshness: Freshness;
};

export type Account = {
  id: string;
  label: string;
  institution: string;
  type: string;
  value: number;
  pctOfNw: number;
  freshness: Freshness;
};

export type DriftRow = {
  class: AssetClass;
  label: string;
  actualPct: number;
  targetPct: number;
  gap: number;
  deltaUsd: number;
};


const SNAPSHOT_AT = "2026-04-26T18:00:00Z";
const PRICE_FRESH: Freshness = {
  source: "yfinance",
  confidence: 0.98,
  capturedAt: "2026-04-26T15:30:00Z",
};
const SNAPSHOT_FRESH: Freshness = { source: "snapshot", capturedAt: SNAPSHOT_AT };
const USER_FRESH: Freshness = { source: "user", capturedAt: "2026-04-25T12:00:00Z" };
const USER_STALE_100D: Freshness = { source: "user", capturedAt: "2026-01-16T12:00:00Z" };
const USER_STALE_32D: Freshness = { source: "user", capturedAt: "2026-03-25T12:00:00Z" };

export const STALE_THRESHOLD_DAYS = 30;

export const mockNetWorth = {
  total: 847392,
  prevTotal: 833410,
  asOf: SNAPSHOT_AT,
  freshness: SNAPSHOT_FRESH,
};

export const mockAllocation: AllocationSlice[] = [
  {
    class: "Stocks",
    label: "Stocks",
    value: 516909,
    pct: 0.61,
    targetPct: 0.65,
    gap: -0.04,
    freshness: PRICE_FRESH,
  },
  {
    class: "Bonds",
    label: "Bonds",
    value: 152531,
    pct: 0.18,
    targetPct: 0.15,
    gap: 0.03,
    freshness: PRICE_FRESH,
  },
  {
    class: "Real Estate",
    label: "Real Estate",
    value: 110161,
    pct: 0.13,
    targetPct: 0.1,
    gap: 0.03,
    freshness: USER_FRESH,
  },
  {
    class: "Cash",
    label: "Cash",
    value: 67791,
    pct: 0.08,
    targetPct: 0.1,
    gap: -0.02,
    freshness: SNAPSHOT_FRESH,
  },
];

export const mockDriftRows: DriftRow[] = [
  {
    class: "Bonds",
    label: "Bonds",
    actualPct: 0.18,
    targetPct: 0.15,
    gap: 0.03,
    deltaUsd: -25422,
  },
  {
    class: "Real Estate",
    label: "Real Estate",
    actualPct: 0.13,
    targetPct: 0.1,
    gap: 0.03,
    deltaUsd: -25422,
  },
  {
    class: "Stocks",
    label: "Stocks",
    actualPct: 0.61,
    targetPct: 0.65,
    gap: -0.04,
    deltaUsd: 25422,
  },
  {
    class: "Cash",
    label: "Cash",
    actualPct: 0.08,
    targetPct: 0.1,
    gap: -0.02,
    deltaUsd: 16948,
  },
];

export const mockAccounts: Account[] = [
  {
    id: "acct-fidelity",
    label: "Fidelity Brokerage",
    institution: "Fidelity",
    type: "Taxable",
    value: 312445,
    pctOfNw: 0.369,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-schwab-ira",
    label: "Schwab IRA",
    institution: "Schwab",
    type: "IRA",
    value: 198320,
    pctOfNw: 0.234,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-401k",
    label: "Employer 401(k)",
    institution: "Vanguard",
    type: "401(k)",
    value: 142880,
    pctOfNw: 0.169,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-realestate",
    label: "Primary residence",
    institution: "Manual",
    type: "Real estate",
    value: 75000,
    pctOfNw: 0.089,
    freshness: USER_STALE_100D,
  },
  {
    id: "acct-hsa",
    label: "HSA",
    institution: "HealthEquity",
    type: "HSA",
    value: 51956,
    pctOfNw: 0.061,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-cash",
    label: "Ally Savings",
    institution: "Ally",
    type: "Cash",
    value: 41000,
    pctOfNw: 0.048,
    freshness: SNAPSHOT_FRESH,
  },
  {
    id: "acct-gold",
    label: "Gold (physical)",
    institution: "Manual",
    type: "Commodities",
    value: 25791,
    pctOfNw: 0.030,
    freshness: USER_STALE_32D,
  },
];

const INVESTABLE_TYPES = new Set(["Taxable", "IRA", "401(k)", "HSA", "Commodities"]);
const investableTotal = mockAccounts
  .filter((a) => INVESTABLE_TYPES.has(a.type))
  .reduce((sum, a) => sum + a.value, 0);

export const mockInvestable = {
  total: investableTotal,
  prevTotal: Math.round(investableTotal / 1.0176),
  asOf: SNAPSHOT_AT,
  freshness: SNAPSHOT_FRESH,
};


export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  Cash: "var(--viz-cash)",
  Stocks: "var(--viz-stocks)",
  Bonds: "var(--viz-bonds)",
  "Real Estate": "var(--viz-real-estate)",
  Commodities: "var(--viz-commodities)",
  Crypto: "var(--viz-crypto)",
  Private: "var(--viz-private)",
};

export function formatUsd(
  value: number,
  opts: { compact?: boolean; signed?: boolean; wholeDollars?: boolean } = {},
) {
  const { compact, signed, wholeDollars } = opts;
  const posSign = signed && value > 0 ? "+" : "";
  const abs = Math.abs(value);
  const negSign = value < 0 ? "\u2212" : "";
  if (compact) {
    return posSign + negSign + new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(abs);
  }
  if (wholeDollars) {
    return posSign + negSign + new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.round(abs));
  }
  // ≥$10k: no cents; <$10k: show 2 decimal places (brand rule)
  const decimals = abs >= 10_000 ? 0 : 2;
  return posSign + negSign + new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(abs);
}

export { formatPct } from "@/app/lib/format";

export function daysSince(iso: string, now: string | Date = SNAPSHOT_AT): number {
  const then = new Date(iso).getTime();
  const ref = typeof now === "string" ? new Date(now).getTime() : now.getTime();
  return Math.max(0, Math.floor((ref - then) / 86_400_000));
}

export function getStaleAccounts(accounts: Account[], now: string | Date = SNAPSHOT_AT): Account[] {
  return accounts
    .filter(
      (a) => a.freshness.capturedAt && daysSince(a.freshness.capturedAt, now) > STALE_THRESHOLD_DAYS,
    )
    .sort(
      (a, b) =>
        daysSince(b.freshness.capturedAt!, now) - daysSince(a.freshness.capturedAt!, now),
    );
}
