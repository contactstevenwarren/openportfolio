// Page-local mock data for /accounts.
// Types are intentionally richer than the current API model (which lacks
// institution, tax_treatment, staleness_threshold_days, is_manual, is_archived).
// These fields will land in a follow-up schema migration. The UI here is a
// design-pass prototype against this extended model.

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountType = "brokerage" | "bank" | "crypto" | "real_estate" | "private";
export type TaxTreatment = "taxable" | "tax_deferred" | "tax_free" | "hsa";

// Matches the canonical brand asset-class token suffixes (--viz-<class>).
// Uses hyphens to stay consistent with _dashboard/mocks.ts and ASSET_CLASS_COLOR.
export type AssetClass =
  | "cash"
  | "us-equity"
  | "intl-equity"
  | "fixed-income"
  | "real-estate"
  | "crypto"
  | "alts"
  | "other";

export type StalenessState = "stale" | "aging" | "fresh";

// ── AccountKind templates ──────────────────────────────────────────────────────
// Maps a single user-facing label to the underlying accountType + taxTreatment
// tuple. Drives the "Account kind" combobox in the Add Account form — the user
// picks one concept and the form fills three fields automatically.

export type AccountKind = {
  id: string;
  label: string;
  accountType: AccountType;
  taxTreatment: TaxTreatment;
  defaultStaleness: number;
  isManual: boolean;
};

export const ACCOUNT_KINDS: AccountKind[] = [
  { id: "k-taxable",     label: "Taxable brokerage", accountType: "brokerage",   taxTreatment: "taxable",      defaultStaleness: 30,  isManual: false },
  { id: "k-roth-ira",    label: "Roth IRA",           accountType: "brokerage",   taxTreatment: "tax_free",     defaultStaleness: 30,  isManual: false },
  { id: "k-trad-ira",    label: "Traditional IRA",    accountType: "brokerage",   taxTreatment: "tax_deferred", defaultStaleness: 30,  isManual: false },
  { id: "k-401k",        label: "401(k)",             accountType: "brokerage",   taxTreatment: "tax_deferred", defaultStaleness: 30,  isManual: false },
  { id: "k-403b",        label: "403(b)",             accountType: "brokerage",   taxTreatment: "tax_deferred", defaultStaleness: 30,  isManual: false },
  { id: "k-hsa",         label: "HSA",                accountType: "brokerage",   taxTreatment: "hsa",          defaultStaleness: 30,  isManual: false },
  { id: "k-checking",    label: "Checking",           accountType: "bank",        taxTreatment: "taxable",      defaultStaleness: 7,   isManual: false },
  { id: "k-savings",     label: "Savings",            accountType: "bank",        taxTreatment: "taxable",      defaultStaleness: 7,   isManual: false },
  { id: "k-crypto",      label: "Crypto wallet",      accountType: "crypto",      taxTreatment: "taxable",      defaultStaleness: 1,   isManual: false },
  { id: "k-real-estate", label: "Real estate",        accountType: "real_estate", taxTreatment: "taxable",      defaultStaleness: 90,  isManual: true  },
  { id: "k-private",     label: "Private equity",     accountType: "private",     taxTreatment: "taxable",      defaultStaleness: 365, isManual: true  },
];

// Fallback for custom / unrecognized kinds created via combobox.
export const CUSTOM_KIND_DEFAULTS: Omit<AccountKind, "id" | "label"> = {
  accountType: "brokerage",
  taxTreatment: "taxable",
  defaultStaleness: 30,
  isManual: false,
};

export type Institution = {
  id: string;
  name: string;
};

export type Account = {
  id: string;
  institutionId: string;
  name: string;
  accountType: AccountType;
  taxTreatment: TaxTreatment;
  balance: number;
  lastUpdatedAt: string;
  lastUpdateSource: "paste" | "pdf" | "manual";
  stalenessThresholdDays: number;
  isManual: boolean;
  isArchived: boolean;
};

export type Snapshot = {
  id: string;
  accountId: string;
  capturedAt: string;
  source: "paste" | "pdf" | "manual";
  totalBalance: number;
};

export type Position = {
  id: string;
  snapshotId: string;
  ticker: string;
  quantity: number;
  value: number;
  assetClass: AssetClass;
  isClassified: boolean;
};

// ── Canonical brand order (brand.md: Cash · US equity · Intl equity · ...) ────

export const ASSET_CLASS_ORDER: AssetClass[] = [
  "cash",
  "us-equity",
  "intl-equity",
  "fixed-income",
  "real-estate",
  "crypto",
  "alts",
  "other",
];

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "Cash",
  "us-equity": "US equity",
  "intl-equity": "Intl equity",
  "fixed-income": "Fixed income",
  "real-estate": "Real estate",
  crypto: "Crypto",
  alts: "Alts",
  other: "Other",
};

// CSS variable references — matches brand.md viz tokens and _dashboard/mocks.ts
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Default staleness threshold by account type (days).
export function defaultStalenessFor(type: AccountType): number {
  switch (type) {
    case "brokerage": return 30;
    case "bank":      return 7;
    case "crypto":    return 1;
    case "real_estate": return 90;
    case "private":   return 365;
  }
}

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

export function stalenessState(account: Account, now: Date = new Date()): StalenessState {
  const days = daysSince(account.lastUpdatedAt, now);
  const t = account.stalenessThresholdDays;
  if (days >= t) return "stale";
  if (days >= Math.max(0, t - 7)) return "aging";
  return "fresh";
}

// Brand rule: >=10k no cents; <10k with cents; Unicode minus U+2212 for negatives.
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "\u2212" : "";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: abs >= 10_000 ? 0 : 2,
    minimumFractionDigits: abs >= 10_000 ? 0 : 2,
  }).format(abs);
  return sign + formatted;
}

// "Updated 47 days ago" for row display.
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const days = daysSince(iso, now);
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated 1 day ago";
  return `Updated ${days} days ago`;
}

// "Updated Apr 12, 2026 · PDF" for Provenance tooltip (brand provenance pattern).
export function formatProvenance(iso: string, source: "paste" | "pdf" | "manual"): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
  const sourceLabel = source === "pdf" ? "PDF" : source === "paste" ? "Paste" : "Manual";
  return `Updated ${date} \u00b7 ${sourceLabel}`;
}

export function groupByInstitution(
  accounts: Account[],
  institutions: Institution[]
): Array<{ institution: Institution; accounts: Account[] }> {
  const instMap = new Map(institutions.map((i) => [i.id, i]));
  const groups = new Map<string, Account[]>();
  for (const acc of accounts) {
    if (!groups.has(acc.institutionId)) groups.set(acc.institutionId, []);
    groups.get(acc.institutionId)!.push(acc);
  }
  return Array.from(groups.entries()).map(([id, accts]) => ({
    institution: instMap.get(id)!,
    accounts: accts,
  }));
}

// Positions indexed by account id via their snapshot id.
export function getPositionsForAccount(
  accountId: string,
  snapshots: Snapshot[],
  positions: Position[]
): Position[] {
  const snap = snapshots
    .filter((s) => s.accountId === accountId)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];
  if (!snap) return [];
  return positions.filter((p) => p.snapshotId === snap.id);
}

// ── Reference date: all mock dates relative to module-load time ───────────────
// This keeps staleness states accurate indefinitely (not pinned to a fixed date).

const NOW = new Date();

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

// ── Seed data ─────────────────────────────────────────────────────────────────

// Reserved id for the built-in escape-hatch institution. Pinned in the
// combobox so users can always reach it.
export const MANUAL_INST_ID = "inst-manual";

export const mockInstitutions: Institution[] = [
  { id: "inst-vanguard",  name: "Vanguard" },
  { id: "inst-fidelity",  name: "Fidelity" },
  { id: "inst-coinbase",  name: "Coinbase" },
  // Built-in escape hatch for assets not tied to a specific institution.
  { id: MANUAL_INST_ID,   name: "Manual / Other" },
];

export const mockAccounts: Account[] = [
  // ── Vanguard ────────────────────────────────────────────────────────────────
  {
    id: "acct-vanguard-brokerage",
    institutionId: "inst-vanguard",
    name: "Brokerage",
    accountType: "brokerage",
    taxTreatment: "taxable",
    balance: 432_100,
    lastUpdatedAt: daysAgo(47),
    lastUpdateSource: "pdf",
    stalenessThresholdDays: 30,   // stale: 47 >= 30
    isManual: false,
    isArchived: false,
  },
  {
    id: "acct-vanguard-401k",
    institutionId: "inst-vanguard",
    name: "401(k)",
    accountType: "brokerage",
    taxTreatment: "tax_deferred",
    balance: 142_880,
    lastUpdatedAt: daysAgo(5),
    lastUpdateSource: "pdf",
    stalenessThresholdDays: 30,   // fresh: 5 < 23
    isManual: false,
    isArchived: false,
  },
  {
    id: "acct-vanguard-private",
    institutionId: "inst-vanguard",
    name: "Private Equity Fund",
    accountType: "private",
    taxTreatment: "taxable",
    balance: 250_000,
    lastUpdatedAt: daysAgo(180),
    lastUpdateSource: "manual",
    stalenessThresholdDays: 365,  // fresh: 180 < 358
    isManual: true,
    isArchived: false,
  },

  // ── Fidelity ─────────────────────────────────────────────────────────────────
  {
    id: "acct-fidelity-checking",
    institutionId: "inst-fidelity",
    name: "Checking",
    accountType: "bank",
    taxTreatment: "taxable",
    balance: 24_830,
    lastUpdatedAt: daysAgo(5),
    lastUpdateSource: "paste",
    stalenessThresholdDays: 7,    // aging: 5 >= (7-7)=0, 5 < 7
    isManual: false,
    isArchived: false,
  },
  {
    id: "acct-fidelity-hsa",
    institutionId: "inst-fidelity",
    name: "HSA",
    accountType: "brokerage",
    taxTreatment: "hsa",
    balance: 18_500,
    lastUpdatedAt: daysAgo(1),
    lastUpdateSource: "pdf",
    stalenessThresholdDays: 30,   // fresh: 1 < 23
    isManual: false,
    isArchived: false,
  },
  {
    id: "acct-fidelity-roth",
    institutionId: "inst-fidelity",
    name: "Roth IRA",
    accountType: "brokerage",
    taxTreatment: "tax_free",
    balance: 189_400,
    lastUpdatedAt: daysAgo(2),
    lastUpdateSource: "pdf",
    stalenessThresholdDays: 30,   // fresh — zero positions to exercise empty state
    isManual: false,
    isArchived: false,
  },

  // ── Coinbase ─────────────────────────────────────────────────────────────────
  {
    id: "acct-coinbase-crypto",
    institutionId: "inst-coinbase",
    name: "Crypto",
    accountType: "crypto",
    taxTreatment: "taxable",
    balance: 32_000,
    lastUpdatedAt: daysAgo(3),
    lastUpdateSource: "manual",
    stalenessThresholdDays: 1,    // stale: 3 >= 1
    isManual: false,
    isArchived: false,
  },

  // ── Archived (hidden by default) ─────────────────────────────────────────────
  {
    id: "acct-vanguard-legacy",
    institutionId: "inst-vanguard",
    name: "Legacy Taxable (Archived)",
    accountType: "brokerage",
    taxTreatment: "taxable",
    balance: 12_500,
    lastUpdatedAt: daysAgo(90),
    lastUpdateSource: "pdf",
    stalenessThresholdDays: 30,
    isManual: false,
    isArchived: true,
  },
];

export const mockSnapshots: Snapshot[] = [
  { id: "snap-vbrokerage",  accountId: "acct-vanguard-brokerage",  capturedAt: daysAgo(47),  source: "pdf",    totalBalance: 432_100 },
  { id: "snap-v401k",       accountId: "acct-vanguard-401k",       capturedAt: daysAgo(5),   source: "pdf",    totalBalance: 142_880 },
  { id: "snap-vprivate",    accountId: "acct-vanguard-private",    capturedAt: daysAgo(180), source: "manual", totalBalance: 250_000 },
  { id: "snap-fchecking",   accountId: "acct-fidelity-checking",   capturedAt: daysAgo(5),   source: "paste",  totalBalance: 24_830  },
  { id: "snap-fhsa",        accountId: "acct-fidelity-hsa",        capturedAt: daysAgo(1),   source: "pdf",    totalBalance: 18_500  },
  // Roth IRA deliberately has no snapshot — zero-positions empty state
  { id: "snap-ccrypto",     accountId: "acct-coinbase-crypto",     capturedAt: daysAgo(3),   source: "manual", totalBalance: 32_000  },
  { id: "snap-vlegacy",     accountId: "acct-vanguard-legacy",     capturedAt: daysAgo(90),  source: "pdf",    totalBalance: 12_500  },
];

export const mockPositions: Position[] = [
  // Vanguard Brokerage (snap-vbrokerage)
  { id: "pos-vb-1", snapshotId: "snap-vbrokerage", ticker: "VTI",   quantity: 1_250, value: 276_500, assetClass: "us-equity",    isClassified: true  },
  { id: "pos-vb-2", snapshotId: "snap-vbrokerage", ticker: "VXUS",  quantity: 980,   value: 77_420,  assetClass: "intl-equity",  isClassified: true  },
  { id: "pos-vb-3", snapshotId: "snap-vbrokerage", ticker: "BND",   quantity: 620,   value: 51_460,  assetClass: "fixed-income", isClassified: true  },
  { id: "pos-vb-4", snapshotId: "snap-vbrokerage", ticker: "VMFXX", quantity: 26_720, value: 26_720, assetClass: "cash",         isClassified: true  },

  // Vanguard 401k (snap-v401k)
  { id: "pos-v4-1", snapshotId: "snap-v401k", ticker: "VFIAX", quantity: 580, value: 95_300, assetClass: "us-equity",    isClassified: true  },
  { id: "pos-v4-2", snapshotId: "snap-v401k", ticker: "VBTLX", quantity: 480, value: 38_080, assetClass: "fixed-income", isClassified: true  },
  { id: "pos-v4-3", snapshotId: "snap-v401k", ticker: "VTIAX", quantity: 190, value: 9_500,  assetClass: "intl-equity",  isClassified: true  },

  // Vanguard Private Equity (snap-vprivate)
  { id: "pos-vp-1", snapshotId: "snap-vprivate", ticker: "PRVT-A", quantity: 1, value: 250_000, assetClass: "alts", isClassified: false },

  // Fidelity Checking (snap-fchecking)
  { id: "pos-fc-1", snapshotId: "snap-fchecking", ticker: "SPAXX", quantity: 24_830, value: 24_830, assetClass: "cash", isClassified: true },

  // Fidelity HSA (snap-fhsa)
  { id: "pos-fh-1", snapshotId: "snap-fhsa", ticker: "FZROX", quantity: 120, value: 11_400, assetClass: "us-equity",    isClassified: true },
  { id: "pos-fh-2", snapshotId: "snap-fhsa", ticker: "FXNAX", quantity: 80,  value: 4_960,  assetClass: "fixed-income", isClassified: true },
  { id: "pos-fh-3", snapshotId: "snap-fhsa", ticker: "FDRXX", quantity: 2_140, value: 2_140, assetClass: "cash",        isClassified: true },

  // Coinbase Crypto (snap-ccrypto)
  { id: "pos-cc-1", snapshotId: "snap-ccrypto", ticker: "BTC", quantity: 0.42, value: 28_000, assetClass: "crypto", isClassified: true },
  { id: "pos-cc-2", snapshotId: "snap-ccrypto", ticker: "ETH", quantity: 2.1,  value: 4_000,  assetClass: "crypto", isClassified: true },

  // Vanguard Legacy archived (snap-vlegacy)
  { id: "pos-vl-1", snapshotId: "snap-vlegacy", ticker: "VTI", quantity: 55, value: 12_500, assetClass: "us-equity", isClassified: true },
];

// Derived aggregate helpers used by header and list

export function totalNetWorth(accounts: Account[]): number {
  return accounts.filter((a) => !a.isArchived).reduce((s, a) => s + a.balance, 0);
}

export function oldestUpdatedDays(accounts: Account[], now: Date = new Date()): number {
  const active = accounts.filter((a) => !a.isArchived);
  if (active.length === 0) return 0;
  return Math.max(...active.map((a) => daysSince(a.lastUpdatedAt, now)));
}
