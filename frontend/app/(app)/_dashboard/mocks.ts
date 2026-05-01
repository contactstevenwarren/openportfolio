export type AssetClass =
  | "cash"
  | "us-equity"
  | "intl-equity"
  | "fixed-income"
  | "real-estate"
  | "crypto"
  | "alts"
  | "other";

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

export type HealthCounts = {
  stalePrices: number;
  untaggedTickers: number;
  missingClassifications: number;
  lastSnapshotAge: string;
};

const SNAPSHOT_AT = "2026-04-26T18:00:00Z";
const PRICE_FRESH: Freshness = {
  source: "yfinance",
  confidence: 0.98,
  capturedAt: "2026-04-26T15:30:00Z",
};
const SNAPSHOT_FRESH: Freshness = { source: "snapshot", capturedAt: SNAPSHOT_AT };
const USER_FRESH: Freshness = { source: "user", capturedAt: "2026-04-25T12:00:00Z" };
const USER_STALE_45D: Freshness = { source: "user", capturedAt: "2026-03-12T12:00:00Z" };
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
    class: "us-equity",
    label: "US equity",
    value: 398274,
    pct: 0.47,
    targetPct: 0.5,
    gap: -0.03,
    freshness: PRICE_FRESH,
  },
  {
    class: "fixed-income",
    label: "Fixed income",
    value: 152531,
    pct: 0.18,
    targetPct: 0.15,
    gap: 0.03,
    freshness: PRICE_FRESH,
  },
  {
    class: "intl-equity",
    label: "Intl equity",
    value: 118635,
    pct: 0.14,
    targetPct: 0.15,
    gap: -0.01,
    freshness: PRICE_FRESH,
  },
  {
    class: "real-estate",
    label: "Real estate",
    value: 110161,
    pct: 0.13,
    targetPct: 0.1,
    gap: 0.03,
    freshness: USER_FRESH,
  },
  {
    class: "cash",
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
    class: "fixed-income",
    label: "Fixed income",
    actualPct: 0.18,
    targetPct: 0.15,
    gap: 0.03,
    deltaUsd: -25422,
  },
  {
    class: "real-estate",
    label: "Real estate",
    actualPct: 0.13,
    targetPct: 0.1,
    gap: 0.03,
    deltaUsd: -25422,
  },
  {
    class: "us-equity",
    label: "US equity",
    actualPct: 0.47,
    targetPct: 0.5,
    gap: -0.03,
    deltaUsd: 25422,
  },
  {
    class: "cash",
    label: "Cash",
    actualPct: 0.08,
    targetPct: 0.1,
    gap: -0.02,
    deltaUsd: 16948,
  },
  {
    class: "intl-equity",
    label: "Intl equity",
    actualPct: 0.14,
    targetPct: 0.15,
    gap: -0.01,
    deltaUsd: 8474,
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
    freshness: USER_STALE_45D,
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
    type: "Alts",
    value: 25791,
    pctOfNw: 0.030,
    freshness: USER_STALE_32D,
  },
];

const INVESTABLE_TYPES = new Set(["Taxable", "IRA", "401(k)", "HSA", "Alts"]);
const investableTotal = mockAccounts
  .filter((a) => INVESTABLE_TYPES.has(a.type))
  .reduce((sum, a) => sum + a.value, 0);

export const mockInvestable = {
  total: investableTotal,
  prevTotal: Math.round(investableTotal / 1.0176),
  asOf: SNAPSHOT_AT,
  freshness: SNAPSHOT_FRESH,
};

export const mockHealth: HealthCounts = {
  stalePrices: 2,
  untaggedTickers: 1,
  missingClassifications: 0,
  lastSnapshotAge: "1 day ago",
};

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  cash: "var(--viz-cash)",
  "us-equity": "var(--viz-us-equity)",
  "intl-equity": "var(--viz-intl-equity)",
  "fixed-income": "var(--viz-fixed-income)",
  "real-estate": "var(--viz-real-estate)",
  crypto: "var(--viz-crypto)",
  alts: "var(--viz-alts)",
  other: "var(--viz-other)",
};

export function formatUsd(value: number, opts: { compact?: boolean; signed?: boolean } = {}) {
  const { compact, signed } = opts;
  const sign = signed && value > 0 ? "+" : "";
  if (compact) {
    return sign + new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return sign + new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number, opts: { signed?: boolean; digits?: number } = {}) {
  const { signed, digits = 1 } = opts;
  const sign = signed && value > 0 ? "+" : "";
  return sign + (value * 100).toFixed(digits) + "%";
}

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
