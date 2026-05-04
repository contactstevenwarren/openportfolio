// _accounts/mocks.ts — shared helpers, types, and lookup tables for the /accounts module.
// Seed data for Storybook stories lives in ./seed.ts (stories-only).

// ── Re-export API types ────────────────────────────────────────────────────────

export type { Account, Institution, AssetClass, AccountClassBreakdown } from "@/app/lib/api";

// ── Asset class lookup tables ──────────────────────────────────────────────────
// Canonical order: brand.md Cash · Equity · Fixed income · Real estate · Commodity · Crypto · Private

import type { AssetClass } from "@/app/lib/api";

export const ASSET_CLASS_ORDER: AssetClass[] = [
  "cash",
  "equity",
  "fixed_income",
  "real_estate",
  "commodity",
  "crypto",
  "private",
];

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "Cash",
  equity: "Equity",
  fixed_income: "Fixed income",
  real_estate: "Real estate",
  commodity: "Commodity",
  crypto: "Crypto",
  private: "Private",
};

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  cash: "var(--viz-cash)",
  equity: "var(--viz-equity)",
  fixed_income: "var(--viz-fixed-income)",
  real_estate: "var(--viz-real-estate)",
  commodity: "var(--viz-commodity)",
  crypto: "var(--viz-crypto)",
  private: "var(--viz-private)",
};

// ── AccountKind templates ──────────────────────────────────────────────────────
// Used by Add/Edit sheets (still design-preview, not yet wired).

export type TaxTreatment = "taxable" | "tax_deferred" | "tax_free" | "hsa";
export type AccountType = "brokerage" | "bank" | "crypto" | "real_estate" | "private";

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
  { id: "k-checking",    label: "Checking",           accountType: "bank",        taxTreatment: "taxable",      defaultStaleness: 30,  isManual: false },
  { id: "k-savings",     label: "Savings",            accountType: "bank",        taxTreatment: "taxable",      defaultStaleness: 30,  isManual: false },
  { id: "k-crypto",      label: "Crypto wallet",      accountType: "crypto",      taxTreatment: "taxable",      defaultStaleness: 30,  isManual: false },
  { id: "k-real-estate", label: "Real estate",        accountType: "real_estate", taxTreatment: "taxable",      defaultStaleness: 90,  isManual: true  },
  { id: "k-private",     label: "Private equity",     accountType: "private",     taxTreatment: "taxable",      defaultStaleness: 365, isManual: true  },
];

export const CUSTOM_KIND_DEFAULTS: Omit<AccountKind, "id" | "label"> = {
  accountType: "brokerage",
  taxTreatment: "taxable",
  defaultStaleness: 30,
  isManual: false,
};

// ── Staleness helpers ──────────────────────────────────────────────────────────

export type StalenessState = "stale" | "aging" | "fresh";

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

export function stalenessState(
  account: { last_updated_at: string | null; staleness_threshold_days: number },
  now: Date = new Date()
): StalenessState {
  if (!account.last_updated_at) return "fresh";
  const days = daysSince(account.last_updated_at, now);
  const t = account.staleness_threshold_days;
  if (days >= t) return "stale";
  if (days >= Math.max(1, Math.floor(t * 0.8))) return "aging";
  return "fresh";
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

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
export function formatProvenance(
  iso: string,
  source: "paste" | "pdf" | "manual"
): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
  const sourceLabel =
    source === "pdf" ? "PDF" : source === "paste" ? "Paste" : "Manual";
  return `Updated ${date} \u00b7 ${sourceLabel}`;
}

// ── Grouping helper ────────────────────────────────────────────────────────────
// Groups accounts by institution_id. Accounts with null institution_id are
// placed under a synthetic "Manual / Other" placeholder (id: -1).

import type { Account, Institution } from "@/app/lib/api";

const MANUAL_OTHER_INSTITUTION: Institution = { id: -1, name: "Manual / Other" };

export function groupByInstitution(
  accounts: Account[],
  institutions: Institution[]
): Array<{ institution: Institution; accounts: Account[] }> {
  const instMap = new Map(institutions.map((i) => [i.id, i]));
  const groups = new Map<number, Account[]>();

  for (const acc of accounts) {
    const key = acc.institution_id ?? -1;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(acc);
  }

  return Array.from(groups.entries()).map(([id, accts]) => ({
    institution: id === -1 ? MANUAL_OTHER_INSTITUTION : (instMap.get(id) ?? MANUAL_OTHER_INSTITUTION),
    accounts: accts,
  }));
}
