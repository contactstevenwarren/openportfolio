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

export type Holding = {
  ticker: string;
  name?: string;
  class: AssetClass;
  classLabel: string;
  value: number;
  pctOfNw: number;
  account: string;
  freshness: Freshness;
};

export type EffectiveExposure = {
  class: AssetClass;
  label: string;
  pct: number;
  freshness: Freshness;
};

export type Account = {
  id: string;
  label: string;
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

export type SnapshotPoint = {
  date: string;
  cash: number;
  "us-equity": number;
  "intl-equity": number;
  "fixed-income": number;
  "real-estate": number;
};

export type ActivityEvent = {
  id: string;
  kind: "snapshot" | "edit" | "extraction";
  label: string;
  at: string;
};

export type HealthCounts = {
  stalePrices: number;
  untaggedTickers: number;
  missingClassifications: number;
  lastSnapshotAge: string;
};

export type DriftStatus =
  | { kind: "rebalance"; worstGapPct: number }
  | { kind: "on-track" }
  | { kind: "no-targets" }
  | { kind: "no-data" };

const SNAPSHOT_AT = "2026-04-26T18:00:00Z";
const PRICE_FRESH: Freshness = {
  source: "yfinance",
  confidence: 0.98,
  capturedAt: "2026-04-26T15:30:00Z",
};
const SNAPSHOT_FRESH: Freshness = { source: "snapshot", capturedAt: SNAPSHOT_AT };
const USER_FRESH: Freshness = { source: "user", capturedAt: "2026-04-25T12:00:00Z" };

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

export const mockDriftStatus: DriftStatus = { kind: "rebalance", worstGapPct: 0.03 };

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

export const mockHoldings: Holding[] = [
  {
    ticker: "VTI",
    name: "Vanguard Total Stock Market",
    class: "us-equity",
    classLabel: "US equity",
    value: 184230,
    pctOfNw: 0.218,
    account: "Fidelity Brokerage",
    freshness: PRICE_FRESH,
  },
  {
    ticker: "VXUS",
    name: "Vanguard Total International",
    class: "intl-equity",
    classLabel: "Intl equity",
    value: 96120,
    pctOfNw: 0.113,
    account: "Fidelity Brokerage",
    freshness: PRICE_FRESH,
  },
  {
    ticker: "BND",
    name: "Vanguard Total Bond Market",
    class: "fixed-income",
    classLabel: "Fixed income",
    value: 88450,
    pctOfNw: 0.104,
    account: "Schwab IRA",
    freshness: PRICE_FRESH,
  },
  {
    ticker: "RE-PRIMARY",
    name: "Primary residence",
    class: "real-estate",
    classLabel: "Real estate",
    value: 75000,
    pctOfNw: 0.089,
    account: "Real estate",
    freshness: USER_FRESH,
  },
  {
    ticker: "VTSAX",
    name: "Vanguard Total Stock Index Admiral",
    class: "us-equity",
    classLabel: "US equity",
    value: 64812,
    pctOfNw: 0.077,
    account: "Schwab IRA",
    freshness: PRICE_FRESH,
  },
];

export const mockExposures: EffectiveExposure[] = [
  { class: "us-equity", label: "US equity", pct: 0.52, freshness: PRICE_FRESH },
  { class: "intl-equity", label: "Intl equity", pct: 0.18, freshness: PRICE_FRESH },
  { class: "fixed-income", label: "Fixed income", pct: 0.16, freshness: PRICE_FRESH },
  { class: "real-estate", label: "Real estate", pct: 0.08, freshness: USER_FRESH },
  { class: "cash", label: "Cash", pct: 0.06, freshness: SNAPSHOT_FRESH },
];

export const mockAccounts: Account[] = [
  {
    id: "acct-fidelity",
    label: "Fidelity Brokerage",
    type: "Taxable",
    value: 312445,
    pctOfNw: 0.369,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-schwab-ira",
    label: "Schwab IRA",
    type: "IRA",
    value: 198320,
    pctOfNw: 0.234,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-401k",
    label: "Employer 401(k)",
    type: "401(k)",
    value: 142880,
    pctOfNw: 0.169,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-realestate",
    label: "Primary residence",
    type: "Real estate",
    value: 75000,
    pctOfNw: 0.089,
    freshness: USER_FRESH,
  },
  {
    id: "acct-hsa",
    label: "HSA",
    type: "HSA",
    value: 51956,
    pctOfNw: 0.061,
    freshness: PRICE_FRESH,
  },
  {
    id: "acct-cash",
    label: "Ally Savings",
    type: "Cash",
    value: 41000,
    pctOfNw: 0.048,
    freshness: SNAPSHOT_FRESH,
  },
  {
    id: "acct-gold",
    label: "Gold (physical)",
    type: "Alts",
    value: 25791,
    pctOfNw: 0.030,
    freshness: USER_FRESH,
  },
];

const monthlyDates = [
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-04-26",
];

const baseSnapshot = {
  cash: 58000,
  "us-equity": 332000,
  "intl-equity": 96000,
  "fixed-income": 134000,
  "real-estate": 100000,
};

export const mockSnapshots: SnapshotPoint[] = monthlyDates.map((date, i) => {
  const growth = 1 + i * 0.012;
  const noise = 1 + Math.sin(i) * 0.02;
  return {
    date,
    cash: Math.round(baseSnapshot.cash * (1 + i * 0.008)),
    "us-equity": Math.round(baseSnapshot["us-equity"] * growth * noise),
    "intl-equity": Math.round(baseSnapshot["intl-equity"] * growth),
    "fixed-income": Math.round(baseSnapshot["fixed-income"] * (1 + i * 0.005)),
    "real-estate": Math.round(baseSnapshot["real-estate"] * (1 + i * 0.006)),
  };
});

export const mockActivity: ActivityEvent[] = [
  { id: "a1", kind: "snapshot", label: "Snapshot saved · $847,392", at: "2026-04-26T18:00:00Z" },
  { id: "a2", kind: "extraction", label: "Imported 12 positions from Fidelity PDF", at: "2026-04-22T14:21:00Z" },
  { id: "a3", kind: "edit", label: "Updated target: Cash 10% → 8%", at: "2026-04-18T09:15:00Z" },
  { id: "a4", kind: "edit", label: "Set HSA cash/invested split", at: "2026-04-12T20:40:00Z" },
  { id: "a5", kind: "snapshot", label: "Snapshot saved · $833,410", at: "2026-04-01T18:00:00Z" },
];

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
