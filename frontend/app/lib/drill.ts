import type { AllocationSlice } from './api';

export type Dim = 'sub_class';
export type Drill = { assetClass: string; dim: Dim } | null;

/** L1 → drill dimension (2-ring model: sub_class children only). */
export const DRILL_CONFIG: Record<string, Dim[]> = {
  Stocks: ['sub_class'],
  Bonds: ['sub_class'],
  'Real Estate': ['sub_class'],
  Commodities: ['sub_class'],
  Crypto: ['sub_class'],
  Cash: ['sub_class'],
  Private: ['sub_class'],
};

export function getDrillSlices(
  root: AllocationSlice[],
  drill: { assetClass: string; dim: Dim },
): AllocationSlice[] {
  const slice = root.find((s) => s.name === drill.assetClass);
  if (!slice) return [];
  const parentValue = slice.value;

  const raw = (slice.children ?? []).map((c) => ({ name: c.name, value: c.value }));

  return raw
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s) => ({
      name: s.name,
      value: s.value,
      pct: parentValue > 0 ? (s.value / parentValue) * 100 : 0,
      tickers: [],
      children: [],
    }));
}
