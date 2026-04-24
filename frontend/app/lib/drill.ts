import type { AllocationSlice } from './api';

export type Dim = 'geography' | 'sector' | 'sub_class';
export type Drill = { assetClass: string; dim: Dim } | null;

export const DRILL_CONFIG: Record<string, Dim[]> = {
  equity: ['geography', 'sector'],
  fixed_income: ['sub_class'],
  real_estate: ['sub_class'],
  cash: ['sub_class'],
  crypto: ['sub_class'],
};

export function getDrillSlices(
  root: AllocationSlice[],
  drill: { assetClass: string; dim: Dim },
): AllocationSlice[] {
  const slice = root.find((s) => s.name === drill.assetClass);
  if (!slice) return [];
  const parentValue = slice.value;

  let raw: { name: string; value: number }[];
  if (drill.dim === 'geography') {
    raw = (slice.children ?? []).map((c) => ({ name: c.name, value: c.value }));
  } else if (drill.dim === 'sector') {
    raw = (slice.sector_breakdown ?? []).map((c) => ({ name: c.name, value: c.value }));
  } else {
    const sums = new Map<string, number>();
    for (const region of slice.children ?? []) {
      for (const sub of region.children ?? []) {
        sums.set(sub.name, (sums.get(sub.name) ?? 0) + sub.value);
      }
    }
    raw = Array.from(sums, ([name, value]) => ({ name, value }));
  }

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
